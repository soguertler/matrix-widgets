#include <stdio.h>
#include <string.h>
#include <sys/sysinfo.h>
#include <sys/utsname.h>

static void cpu_name(char *name, size_t length) {
    FILE *file = fopen("/proc/cpuinfo", "r");
    if (!file) return;
    char line[256];
    while (fgets(line, sizeof(line), file)) {
        if (strncmp(line, "model name", 10) != 0) continue;
        char *value = strchr(line, ':');
        if (!value) break;
        value += 2;
        value[strcspn(value, "\n")] = '\0';
        snprintf(name, length, "%s", value);
        break;
    }
    fclose(file);
}

int main(void) {
    struct utsname system;
    struct sysinfo resources;
    if (uname(&system) != 0 || sysinfo(&resources) != 0) {
        fputs("widgetfetch: could not read system information\n", stderr);
        return 1;
    }

    char cpu[128] = "x86 compatible processor";
    cpu_name(cpu, sizeof(cpu));
    unsigned long long total =
        (unsigned long long)resources.totalram * resources.mem_unit / 1048576;
    unsigned long long used =
        (unsigned long long)(resources.totalram - resources.freeram) * resources.mem_unit / 1048576;
    unsigned long uptime_minutes = (unsigned long)resources.uptime / 60;

    printf("\033[1;32m  ╭─────────╮\033[0m  \033[1mwidget@%s\033[0m\n", system.nodename);
    printf("\033[1;32m  │  >_     │\033[0m  OS: Widget Linux (Buildroot)\n");
    printf("\033[1;32m  │         │\033[0m  Kernel: %s\n", system.release);
    printf("\033[1;32m  ╰─────────╯\033[0m  Arch: %s\n", system.machine);
    printf("               CPU: %s\n", cpu);
    printf("               Memory: %llu / %llu MiB\n", used, total);
    printf("               Uptime: %lu min\n", uptime_minutes);
    return 0;
}
