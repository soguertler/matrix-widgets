#define _DEFAULT_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <termios.h>
#include <unistd.h>
#include <sys/select.h>
#include <signal.h>
#include <time.h>

#define WIDTH 30
#define HEIGHT 14
static struct termios saved;
static volatile sig_atomic_t running = 1;
static int restored = 0;
static void stop(int signal) { (void)signal; running = 0; }
static void restore(void) {
    if (restored) return;
    restored = 1;
    tcsetattr(STDIN_FILENO, TCSANOW, &saved);
    printf("\033[?25h\033[?1049l");
    fflush(stdout);
}
int main(void) {
    if (tcgetattr(STDIN_FILENO, &saved) != 0) return 1;
    struct termios raw = saved;
    raw.c_lflag &= ~(ICANON | ECHO);
    raw.c_cc[VMIN] = 0;
    raw.c_cc[VTIME] = 0;
    if (tcsetattr(STDIN_FILENO, TCSANOW, &raw) != 0) return 1;
    atexit(restore);
    signal(SIGINT, stop); signal(SIGTERM, stop);
    srand((unsigned)time(NULL));
    int x[WIDTH * HEIGHT] = {15, 14, 13};
    int y[WIDTH * HEIGHT] = {7, 7, 7};
    int length = 3, dx = 1, dy = 0, foodx = 20, foody = 7;
    int escape = 0;
    printf("\033[?1049h\033[?25l");
    while (running) {
        printf("\033[H Snake | score %d | arrows/WASD | q quits\033[K\n", length - 3);
        for (int row = -1; row <= HEIGHT; row++) {
            for (int col = -1; col <= WIDTH; col++) {
                char cell = ' ';
                if (row < 0 || row == HEIGHT || col < 0 || col == WIDTH) cell = '#';
                else if (col == foodx && row == foody) cell = '*';
                for (int i = 0; i < length; i++)
                    if (x[i] == col && y[i] == row) cell = i ? 'o' : '@';
                putchar(cell);
            }
            printf("\033[K\n");
        }
        fflush(stdout);
        struct timeval delay = {.tv_sec = 0, .tv_usec = 140000};
        int nextdx = dx, nextdy = dy, turned = 0;
        while (running) {
            fd_set input; FD_ZERO(&input); FD_SET(STDIN_FILENO, &input);
            if (select(STDIN_FILENO + 1, &input, NULL, NULL, &delay) <= 0) break;
            char c;
            if (read(STDIN_FILENO, &c, 1) != 1) { running = 0; break; }
            if (c == 'q') { running = 0; break; }
            if (c == '\033') { escape = 1; continue; }
            if (escape == 1 && c == '[') { escape = 2; continue; }
            if (escape == 2) {
                if (c == 'A') c = 'w'; else if (c == 'B') c = 's';
                else if (c == 'C') c = 'd'; else if (c == 'D') c = 'a';
            }
            escape = 0;
            if (turned) continue;
            if (c == 'w' && dy != 1) { nextdx = 0; nextdy = -1; turned = 1; }
            if (c == 's' && dy != -1) { nextdx = 0; nextdy = 1; turned = 1; }
            if (c == 'a' && dx != 1) { nextdx = -1; nextdy = 0; turned = 1; }
            if (c == 'd' && dx != -1) { nextdx = 1; nextdy = 0; turned = 1; }
        }
        if (!running) break;
        dx = nextdx; dy = nextdy;
        int nx = x[0] + dx, ny = y[0] + dy;
        int grow = nx == foodx && ny == foody;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) break;
        int collision = 0;
        for (int i = 0; i < length - !grow; i++)
            if (x[i] == nx && y[i] == ny) collision = 1;
        if (collision) break;
        if (grow) length++;
        for (int i = length - 1; i > 0; i--) { x[i] = x[i-1]; y[i] = y[i-1]; }
        x[0] = nx; y[0] = ny;
        if (length == WIDTH * HEIGHT) break;
        if (grow) {
            int occupied;
            do {
                foodx = rand() % WIDTH; foody = rand() % HEIGHT; occupied = 0;
                for (int i = 0; i < length; i++)
                    if (x[i] == foodx && y[i] == foody) occupied = 1;
            } while (occupied);
        }
    }
    restore();
    printf("Snake finished. Score: %d\n", length - 3);
    return 0;
}
