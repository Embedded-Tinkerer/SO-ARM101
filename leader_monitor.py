import time
import serial

PORT = 'COM4'
BAUD = 1000000
SERVO_IDS = [1, 2, 3, 4, 5, 6]

# Feetech STS Memory Table
REG_TORQUE_ENABLE = 0x28  # 1 byte
REG_PRESENT_POSITION = 0x38  # 2 bytes (Little-Endian: Low, High)

def write_byte(ser, sid, reg, val):
    # Instruction 0x03: WRITE
    length = 4
    chk = (~(sid + length + 0x03 + reg + val)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, length, 0x03, reg, val, chk]))
    time.sleep(0.001)
    ser.read(6)  # Flush status return

def read_position(ser, sid):
    # Instruction 0x02: READ (Address, Length)
    length = 4
    read_len = 2
    chk = (~(sid + length + 0x02 + REG_PRESENT_POSITION + read_len)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, length, 0x02, REG_PRESENT_POSITION, read_len, chk]))
    
    # Expected reply: FF FF ID LEN ERROR POS_L POS_H CHK (8 bytes)
    resp = ser.read(8)
    if len(resp) >= 8 and resp[0] == 0xFF and resp[1] == 0xFF:
        raw_pos = resp[5] | (resp[6] << 8)
        # Convert 12-bit (0-4095) to degrees (0 - 360)
        deg = (raw_pos / 4096.0) * 360.0
        return raw_pos, deg
    return None, None

try:
    ser = serial.Serial(PORT, baudrate=BAUD, timeout=0.02)
    print(f"Connected to Leader Arm on {PORT} @ {BAUD} baud.")
except Exception as e:
    print(f"Error opening {PORT}: {e}")
    exit(1)

# Disable torque on all joints so it's freely backdrivable
print("Disabling holding torque across all joints...")
for sid in SERVO_IDS:
    write_byte(ser, sid, REG_TORQUE_ENABLE, 0)

print("\nStreaming Joint Angles (Press Ctrl+C to stop)...")
try:
    while True:
        positions_deg = []
        for sid in SERVO_IDS:
            raw, deg = read_position(ser, sid)
            if deg is not None:
                positions_deg.append(f"J{sid}: {deg:5.1f}°")
            else:
                positions_deg.append(f"J{sid}:  ERR  ")
        
        print("\r" + " | ".join(positions_deg), end="", flush=True)
        time.sleep(0.02)  # ~50 Hz update rate
except KeyboardInterrupt:
    print("\nExiting telemetry stream.")
finally:
    ser.close()