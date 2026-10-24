#define _DEFAULT_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dirent.h>
#include <termios.h>
#include <unistd.h>
#include <signal.h>
#include <sys/select.h>
#include <sys/ioctl.h>

static struct termios saved;
static volatile sig_atomic_t running = 1;
static void stop(int signal) { (void)signal; running = 0; }
static void restore(void) {
    tcsetattr(STDIN_FILENO, TCSANOW, &saved);
    printf("\033[?25h\033[?1049l"); fflush(stdout);
}
struct process { int pid; long rss; char name[128]; char state; };
static int by_memory(const void *a, const void *b) {
    const struct process *pa = a, *pb = b;
    return pa->rss < pb->rss ? 1 : pa->rss > pb->rss ? -1 : pa->pid - pb->pid;
}
int main(void) {
    if (tcgetattr(STDIN_FILENO, &saved) != 0) return 1;
    struct termios raw = saved;
    raw.c_lflag &= ~(ICANON | ECHO);
    if (tcsetattr(STDIN_FILENO, TCSANOW, &raw) != 0) return 1;
    atexit(restore); signal(SIGINT, stop); signal(SIGTERM, stop);
    printf("\033[?1049h\033[?25l");
    unsigned long long previous_total = 0, previous_idle = 0;
    while (running) {
        unsigned long long user=0, nice=0, system=0, idle=0, wait=0, irq=0, soft=0, steal=0;
        FILE *file = fopen("/proc/stat", "r");
        if (file) { fscanf(file, "cpu %llu %llu %llu %llu %llu %llu %llu %llu", &user, &nice, &system, &idle, &wait, &irq, &soft, &steal); fclose(file); }
        unsigned long long total = user+nice+system+idle+wait+irq+soft+steal;
        unsigned long long delta = total - previous_total;
        double cpu = delta ? 100.0 * (delta - (idle+wait-previous_idle)) / delta : 0;
        previous_total = total; previous_idle = idle+wait;
        char load[128] = "unavailable", line[256];
        file = fopen("/proc/loadavg", "r");
        if (file) { if (fgets(load, sizeof load, file)) load[strcspn(load, "\n")] = 0; fclose(file); }
        long memory = 0, available = 0;
        file = fopen("/proc/meminfo", "r");
        if (file) {
            while (fgets(line, sizeof line, file)) {
                sscanf(line, "MemTotal: %ld", &memory);
                sscanf(line, "MemAvailable: %ld", &available);
            }
            fclose(file);
        }
        struct process processes[512]; int count = 0;
        DIR *directory = opendir("/proc"); struct dirent *entry;
        if (directory) {
            while ((entry = readdir(directory)) && count < 512) {
                char *end; long pid = strtol(entry->d_name, &end, 10);
                if (*end || pid <= 0) continue;
                char path[64]; snprintf(path, sizeof path, "/proc/%ld/status", pid);
                file = fopen(path, "r"); if (!file) continue;
                struct process process = {.pid = (int)pid, .state = '?'};
                while (fgets(line, sizeof line, file)) {
                    sscanf(line, "Name: %127s", process.name);
                    sscanf(line, "State: %c", &process.state);
                    sscanf(line, "VmRSS: %ld", &process.rss);
                }
                fclose(file); processes[count++] = process;
            }
            closedir(directory);
        }
        qsort(processes, count, sizeof processes[0], by_memory);
        struct winsize size = {.ws_row = 24}; ioctl(STDOUT_FILENO, TIOCGWINSZ, &size);
        printf("\033[H top | q quits | %d processes\033[K\nCPU %5.1f%% | RAM %ld / %ld KiB\033[K\nLoad %s\033[K\n\n   PID S   RSS KiB COMMAND\033[K\n", count, cpu, memory-available, memory, load);
        for (int i = 0; i < count && i < (int)size.ws_row - 6; i++)
            printf("%6d %c %9ld %.32s\033[K\n", processes[i].pid, processes[i].state, processes[i].rss, processes[i].name);
        printf("\033[J"); fflush(stdout);
        fd_set input; FD_ZERO(&input); FD_SET(STDIN_FILENO, &input);
        struct timeval delay = {.tv_sec = 1};
        if (select(STDIN_FILENO+1, &input, NULL, NULL, &delay) > 0) {
            char c; if (read(STDIN_FILENO, &c, 1) != 1 || c == 'q') break;
        }
    }
    return 0;
}
