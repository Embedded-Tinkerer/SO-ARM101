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

# 3. Create a second dataset (e.g., bus under load / higher traffic)
loaded_traffic = np.random.normal(loc=340, scale=40, size=1000)
traffic_outliers = np.array([490.0, 530.0, 580.0, 620.0])
dataset_2 = np.concatenate([loaded_traffic, traffic_outliers])

# 4. Plot overlaid histograms
pyplot.figure(figsize=(10, 6))

# Plot Dataset 1 (Baseline)
pyplot.hist(
    loaded_data,
    bins=50,
    alpha=0.6,
    color="tab:blue",
    label=f"Baseline (Median: {median_val:.1f} µs, p99: {p99_val:.1f} µs)"
)

# Plot Dataset 2 (Loaded)
median_val_2 = np.median(dataset_2)
p99_val_2 = np.percentile(dataset_2, 99)
pyplot.hist(
    dataset_2,
    bins=50,
    alpha=0.6,
    color="tab:orange",
    label=f"Under Load (Median: {median_val_2:.1f} µs, p99: {p99_val_2:.1f} µs)"
)

# Titles, labels, and formatting
pyplot.title("Packet Round-Trip Latency Comparison", fontsize=14, fontweight="bold")
pyplot.xlabel("Latency (µs)", fontsize=12)
pyplot.ylabel("Frequency (Counts)", fontsize=12)
pyplot.grid(True, linestyle="--", alpha=0.5)
pyplot.legend(loc="upper right", fontsize=10)

# Save figure to PNG
output_image = "latency_hist.png"
pyplot.savefig(output_image, dpi=300, bbox_inches="tight")
print(f"Plot saved successfully as '{output_image}'")
