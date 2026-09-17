import serial, time

def ping(port, baud, servo_id):
    try:
        ser = serial.Serial(port, baudrate=baud, timeout=0.1)
        # STS3215 / HX-series PING packet: FF FF ID 02 01 Checksum
        checksum = ~(servo_id + 0x02 + 0x01) & 0xFF
        pkt = bytearray([0xFF, 0xFF, servo_id, 0x02, 0x01, checksum])
        
        ser.reset_input_buffer()
        ser.write(pkt)
        time.sleep(0.02)
        resp = ser.read(10)
        ser.close()
        return resp
    except Exception as e:
        return str(e)

for baud in [1000000, 115200]:
    for sid in range(1, 7):
        r = ping('/dev/ttyACM0', baud, sid)
        if r and len(r) > 0:
            print(f"Found response at {baud} baud! ID {sid}: {list(r)}")
            