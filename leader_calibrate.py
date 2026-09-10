import json
import os
import time
import serial

PORT = 'COM4'
BAUD = 1000000
SERVO_IDS = [1, 2, 3, 4, 5, 6]
CONFIG_FILE = 'leader_calibration.json'

REG_PRESENT_POSITION = 0x38

def read_raw_position(ser, sid):
    chk = (~(sid + 4 + 0x02 + REG_PRESENT_POSITION + 2)) & 0xFF
    ser.write(bytearray([0xFF, 0xFF, sid, 4, 0x02, REG_PRESENT_POSITION, 2, chk]))
    resp = ser.read(8)
    if len(resp) >= 8 and resp[0] == 0xFF and resp[1] == 0xFF:
        return resp[5] | (resp[6] << 8)
    return None

try:
    ser = serial.Serial(PORT, baudrate=BAUD, timeout=0.02)
except Exception as e:
    print(f"Error: {e}")
    exit(1)

calibration = {}

print("=== Leader Arm Calibration Utility ===")
input("\n1. Move the arm into your desired ZERO / HOME pose, then press Enter...")

zero_offsets = {}
for sid in SERVO_IDS:
    pos = read_raw_position(ser, sid)
    zero_offsets[f"joint_{sid}"] = pos
    print(f"  Joint {sid} Zero Tick: {pos}")

calibration['zero_ticks'] = zero_offsets

input("\n2. Press Enter to begin recording MIN/MAX limits. Move all joints through their full range of motion. Press Ctrl+C when finished.")

min_ticks = {f"joint_{sid}": 4096 for sid in SERVO_IDS}
max_ticks = {f"joint_{sid}": 0 for sid in SERVO_IDS}

try:
    while True:
        status_line = []
        for sid in SERVO_IDS:
            pos = read_raw_position(ser, sid)
            if pos is not None:
                key = f"joint_{sid}"
                if pos < min_ticks[key]: min_ticks[key] = pos
                if pos > max_ticks[key]: max_ticks[key] = pos
                status_line.append(f"J{sid}: {pos:4d}")
        print("\rTracking: " + " | ".join(status_line), end="", flush=True)
        time.sleep(0.02)
except KeyboardInterrupt:
    print("\n\nLimits captured.")

calibration['min_ticks'] = min_ticks
calibration['max_ticks'] = max_ticks

with open(CONFIG_FILE, 'w') as f:
    json.dump(calibration, f, indent=4)

print(f"\nCalibration saved successfully to {CONFIG_FILE}!")
ser.close()