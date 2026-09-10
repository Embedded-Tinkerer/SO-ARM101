import socket
import struct
import time
import serial

PORT = 'COM4'
BAUD = 1000000
PYNQ_IP ="100.119.96.60"  # <-- Replace with your PYNQ board IP
UDP_PORT = 5005
SERVO_IDS = [1, 2, 3, 4, 5, 6]

REG_TORQUE_ENABLE = 0x28
REG_PRESENT_POSITION = 0x38

def write_byte(ser, sid, reg, val):
    chk = (~(sid + 4 + 0x03 + reg + val)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, 4, 0x03, reg, val, chk]))
    time.sleep(0.001)
    ser.read(6)

def read_position(ser, sid):
    chk = (~(sid + 4 + 0x02 + REG_PRESENT_POSITION + 2)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, 4, 0x02, REG_PRESENT_POSITION, 2, chk]))
    resp = ser.read(8)
    if len(resp) >= 8 and resp[0] == 0xFF and resp[1] == 0xFF:
        return resp[5] | (resp[6] << 8)
    return None

ser = serial.Serial(PORT, baudrate=BAUD, timeout=0.02)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Ensure leader joints are freely backdrivable
for sid in SERVO_IDS:
    write_byte(ser, sid, REG_TORQUE_ENABLE, 0)

print(f"Streaming teleop poses to {PYNQ_IP}:{UDP_PORT} @ ~50 Hz...")

try:
    while True:
        positions = []
        for sid in SERVO_IDS:
            pos = read_position(ser, sid)
            positions.append(float(pos if pos is not None else 2048))
        
        # Pack 6 joint targets into binary float payload
        pkt = struct.pack('6f', *positions)
        sock.sendto(pkt, (PYNQ_IP, UDP_PORT))
        time.sleep(0.02)
except KeyboardInterrupt:
    print("\nStreaming stopped.")
finally:
    ser.close()
    sock.close()