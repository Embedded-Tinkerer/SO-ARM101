def stats(numbers: list(float)) -> tuple[float, float, float]:
    """calculate min, max, and average"""

    if not numbers:
        raise ValueError("Numbers list is empty")

    minimum = min(numbers)
    maximum = max(numbers)
    average = sum(numbers) / len(numbers)

    return minimum, maximum, average

def main():
    print("Hello from SO-ARM101 ramp-up")

    samples = [12.0, 11.9, 12.1, 12.05, 11.95]
    mn, mx, avg = stats(samples)
    print(f"Voltages -> min: {mn: .2f}V, max: {mx: .2f}V, average: {avg: .2f}V")

if __name__ == "__main__":
    main()