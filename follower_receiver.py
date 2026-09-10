import socket
import struct
import time
import serial

PORT = '/dev/ttyACM0'
BAUD = 1000000
UDP_IP = "0.0.0.0"
UDP_PORT = 5005
SERVO_IDS = [1, 2, 3, 4, 5, 6]

REG_TORQUE_ENABLE = 0x28
REG_GOAL_POSITION = 0x2A

def write_byte(ser, sid, reg, val):
    chk = (~(sid + 4 + 0x03 + reg + val)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, 4, 0x03, reg, val, chk]))
    time.sleep(0.001)
    ser.read(6)

def sync_write_positions(ser, positions):
    # Feetech SYNC_WRITE packet format:
    # FF FF FE LEN 0x83 REG_START REG_LEN [ID POS_L POS_H TIME_L TIME_H SPEED_L SPEED_H]... CHK
    data_len = 6  # 2 bytes position, 2 bytes time, 2 bytes speed per servo
    length = 2 + 2 + (1 + data_len) * len(SERVO_IDS)
    body = bytearray([0xFF, 0xFF, 0xFE, length, 0x83, REG_GOAL_POSITION, data_len])
    
    chk_sum = 0xFE + length + 0x83 + REG_GOAL_POSITION + data_len
    for sid, pos in zip(SERVO_IDS, positions):
        pos = max(0, min(4095, int(pos)))
        p_l = pos & 0xFF
        p_h = (pos >> 8) & 0xFF
        # time=0 (fastest response), speed=0 (maximum velocity)
        entry = [sid, p_l, p_h, 0x00, 0x00, 0x00, 0x00]
        body.extend(entry)
        chk_sum += sum(entry)
        
    body.append((~chk_sum) & 0xFF)
    ser.write(body)

try:
    ser = serial.Serial(PORT, baudrate=BAUD, timeout=0.01)
    print(f"Connected to Follower Arm on {PORT}")
except Exception as e:
    print(f"Failed to open {PORT}: {e}")
    exit(1)

print("Enabling holding torque on all follower joints...")
for sid in SERVO_IDS:
    write_byte(ser, sid, REG_TORQUE_ENABLE, 1)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))
print(f"Listening for teleop stream on UDP port {UDP_PORT}...")

try:
    while True:
        data, _ = sock.recvfrom(1024)
        if len(data) == 24:  # 6 joint floats (4 bytes each)
            targets = struct.unpack('6f', data)
            sync_write_positions(ser, targets)
except KeyboardInterrupt:
    print("\nDisabling torque and shutting down...")
    for sid in SERVO_IDS:
        write_byte(ser, sid, REG_TORQUE_ENABLE, 0)
    ser.close()
    sock.close()