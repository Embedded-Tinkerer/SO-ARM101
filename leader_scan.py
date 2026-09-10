import time
import serial

PORT = 'COM4'
BAUDS = [1000000, 500000, 115200, 250000]

def build_ping_packet(servo_id):
    length = 2
    instr = 1  # PING
    checksum = (~(servo_id + length + instr)) & 0xFF
    return bytearray([0xFF, 0xFF, servo_id, length, instr, checksum])

print(f"Connecting to leader arm on {PORT}...")

for baud in BAUDS:
    print(f"\n--- Scanning at {baud} baud ---")
    try:
        # 100ms timeout to catch servos with return delays
        ser = serial.Serial(PORT, baudrate=baud, timeout=0.1)
    except Exception as e:
        print(f"Failed to open {PORT}: {e}")
        break

    ser.reset_input_buffer()
    ser.reset_output_buffer()

    found_any = False
    # Scan IDs 1 to 16, plus 0xFE (broadcast)
    scan_ids = list(range(1, 17)) + [0xFE]
    
    for sid in scan_ids:
        pkt = build_ping_packet(sid)
        ser.write(pkt)
        time.sleep(0.005)

        response = ser.read(6)
        if response:
            if len(response) >= 6 and response[0] == 0xFF and response[1] == 0xFF:
                print(f"--> [LEADER SERVO FOUND] ID: {sid} ({hex(sid)}) | Response: {[hex(b) for b in response]}")
                found_any = True
            else:
                print(f"    Raw noise/bytes received on ID {sid}: {[hex(b) for b in response]}")

    ser.close()
    if found_any:
        print(f"\nBus communication active at {baud} baud!")
        break