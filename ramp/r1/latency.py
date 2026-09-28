import numpy as np
import matplotlib.pyplot as pyplot

np.random.seed(42)

baseline = np.random.normal(loc=300, scale=20, size=1000)

outliers = np.array([430.0, 475.0, 510.0, 560.0])
dataset_1 = np.concatenate([baseline, outliers])

# Save to CSV
np.savetxt("latency.csv", dataset_1, delimiter=",", header="latency_us", comments="")
print(f"Generated {len(dataset_1)} samples and saved to latency.csv")

# 2. Load the dataset back from CSV
# skiprows=1 skips the header row 'latency_us'
loaded_data = np.loadtxt("latency.csv", delimiter=",", skiprows=1)

# Compute metrics
median_val = np.median(loaded_data)
p99_val = np.percentile(loaded_data, 99)
max_val = loaded_data.max()

print("\n--- Latency Statistics (Dataset 1) ---")
print(f"Median (50th percentile) : {median_val:.2f} us")
print(f"99th Percentile (p99)    : {p99_val:.2f} us")
print(f"Maximum Latency          : {max_val:.2f} us")
