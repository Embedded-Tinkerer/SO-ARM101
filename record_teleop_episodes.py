import os
import time
import struct
import socket
import serial
import h5py
import numpy as np

# Configuration
PORT = 'COM4'
BAUD = 1000000
PYNQ_IP = "100.119.96.60"
UDP_PORT = 5005
SERVO_IDS = [1, 2, 3, 4, 5, 6]
OUTPUT_DIR = "./demonstrations"
RATE_HZ = 50
DT = 1.0 / RATE_HZ

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

def save_episode(episode_id, timestamps, qpos_list, action_list):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"episode_{episode_id:04d}.hdf5")

    qpos_arr = np.array(qpos_list, dtype=np.float32)
    action_arr = np.array(action_list, dtype=np.float32)
    time_arr = np.array(timestamps, dtype=np.float32)

    # Compute approximate velocities: dq / dt
    if len(time_arr) > 1:
        dt_arr = np.diff(time_arr, prepend=time_arr[0] + 1e-4)[:, None]
        dt_arr[dt_arr <= 0] = 1e-4
        qvel_arr = np.diff(qpos_arr, axis=0, prepend=qpos_arr[0:1]) / dt_arr
    else:
        qvel_arr = np.zeros_like(qpos_arr)

    with h5py.File(filepath, 'w') as f:
        obs = f.create_group('observations')
        obs.create_dataset('qpos', data=qpos_arr)
        obs.create_dataset('qvel', data=qvel_arr.astype(np.float32))
        f.create_dataset('action', data=action_arr)
        f.create_dataset('timestamp', data=time_arr)

    print(f"\n[SAVED] Episode {episode_id} ({len(time_arr)} frames) -> {filepath}")

# Initialize interfaces
ser = serial.Serial(PORT, baudrate=BAUD, timeout=0.02)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

for sid in SERVO_IDS:
    write_byte(ser, sid, REG_TORQUE_ENABLE, 0)

print("=== Teleoperation & Dataset Recorder Initialized ===")
print("Commands: [Enter] = Start/Stop Episode, [Ctrl+C] = Exit")

episode_counter = 0
is_recording = False
timestamps = []
qpos_history = []
action_history = []
episode_start_time = 0.0

try:
    while True:
        # Non-blocking check for episode toggle (or press Enter in terminal)
        cmd = input("Press [Enter] to BEGIN recording next episode...")
        is_recording = True
        episode_start_time = time.perf_counter()
        timestamps.clear()
        qpos_history.clear()
        action_history.clear()

        print(f"--> [RECORDING] Episode {episode_counter} started. Press [Ctrl+C] to END episode.")

        try:
            while is_recording:
                loop_start = time.perf_counter()
                current_time = loop_start - episode_start_time

                # Read current leader joint states
                current_qpos = []
                for sid in SERVO_IDS:
                    pos = read_position(ser, sid)
                    current_qpos.append(float(pos if pos is not None else 2048.0))

                # Actions sent to follower
                action_targets = list(current_qpos)

                # Stream to follower
                payload = struct.pack('6f', *action_targets)
                sock.sendto(payload, (PYNQ_IP, UDP_PORT))

                # Log to memory buffer
                timestamps.append(current_time)
                qpos_history.append(current_qpos)
                action_history.append(action_targets)

                # Maintain 50 Hz loop timing
                elapsed = time.perf_counter() - loop_start
                sleep_time = max(0.0, DT - elapsed)
                time.sleep(sleep_time)

        except KeyboardInterrupt:
            # End current episode
            if len(timestamps) > 10:
                save_episode(episode_counter, timestamps, qpos_history, action_history)
                episode_counter += 1
            else:
                print("\n[DISCARDED] Episode too short.")
            print("\nReady for next action.")

except Exception as e:
    print(f"Shutdown: {e}")
finally:
    ser.close()
    sock.close()