import glob
import h5py
import numpy as np

files = sorted(glob.glob("./demonstrations/*.hdf5"))
print(f"Found {len(files)} recorded episodes.\n")

for fpath in files:
    with h5py.File(fpath, 'r') as f:
        qpos = f['observations/qpos'][:]
        action = f['action'][:]
        t = f['timestamp'][:]
        
        duration = t[-1] - t[0] if len(t) > 1 else 0
        avg_hz = len(t) / duration if duration > 0 else 0
        
        print(f"File: {fpath}")
        print(f"  Frames: {len(t)} | Duration: {duration:.2f}s | Avg Rate: {avg_hz:.1f} Hz")
        print(f"  Joint 1 Min/Max: [{np.min(qpos[:, 0]):.1f}, {np.max(qpos[:, 0]):.1f}]")
        print(f"  Shape - qpos: {qpos.shape}, action: {action.shape}\n")