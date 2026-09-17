#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <fcntl.h>
#include <unistd.h>
#include <termios.h>

#define DEFAULT_PORT "/dev/ttyACM0"

int init_raw_uart(const char *port) {
    int fd = open(port, O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) {
        perror("Error opening UART");
        return -1;
    }

    struct termios tty;
    if (tcgetattr(fd, &tty) != 0) {
        perror("tcgetattr failed");
        close(fd);
        return -1;
    }

    // Configure 1,000,000 baud, 8-N-1 raw mode
    cfsetispeed(&tty, B1000000);
    cfsetospeed(&tty, B1000000);

    tty.c_cflag = (tty.c_cflag & ~CSIZE) | CS8;
    tty.c_cflag &= ~(PARENB | CSTOPB | CRTSCTS);
    tty.c_cflag |= (CLOCAL | CREAD);

    tty.c_lflag = 0;
    tty.c_oflag = 0;
    tty.c_iflag &= ~(IXON | IXOFF | IXANY | ICRNL | INLCR);

    tty.c_cc[VMIN] = 0;
    tty.c_cc[VTIME] = 0;

    if (tcsetattr(fd, TCSANOW, &tty) != 0) {
        perror("tcsetattr failed");
        close(fd);
        return -1;
    }

    return fd;
}

int ping_servo(int fd, uint8_t id) {
    // STS Frame: [0xFF, 0xFF, ID, Length=2, Instruction=1 (PING), Checksum]
    uint8_t chk = ~(id + 2 + 1) & 0xFF;
    uint8_t tx_pkt[6] = {0xFF, 0xFF, id, 0x02, 0x01, chk};

    tcflush(fd, TCIFLUSH);
    write(fd, tx_pkt, sizeof(tx_pkt));
    tcdrain(fd); // Ensure hardware FIFO has fully drained onto the wire

    // Poll for 6-byte response packet: [0xFF, 0xFF, ID, Length=2, Status, Checksum]
    uint8_t rx[6];
    int count = 0;
    for (int i = 0; i < 200; i++) { // ~20ms timeout
        int n = read(fd, rx + count, sizeof(rx) - count);
        if (n > 0) count += n;
        if (count >= 6) break;
        usleep(100);
    }

    if (count == 6 && rx[0] == 0xFF && rx[1] == 0xFF && rx[2] == id) {
        uint8_t expected_chk = ~(rx[2] + rx[3] + rx[4]) & 0xFF;
        if (rx[5] == expected_chk) {
            printf("[ACK] Servo ID %d responded! (Status: 0x%02X)\n", id, rx[4]);
            return 1;
        }
    }
    printf("[---] Servo ID %d: No response\n", id);
    return 0;
}

int main(int argc, char *argv[]) {
    const char *port = (argc > 1) ? argv[1] : DEFAULT_PORT;

    printf("Opening %s at 1,000,000 baud...\n", port);
    int fd = init_raw_uart(port);
    if (fd < 0) return 1;

    printf("Scanning bus for Servos 1 through 6...\n");
    for (uint8_t id = 1; id <= 6; id++) {
        ping_servo(fd, id);
        usleep(5000); // 5ms inter-packet spacing
    }

    close(fd);
    return 0;
}