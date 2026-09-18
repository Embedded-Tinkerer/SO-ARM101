import time
from pynq import Overlay

print("--> Loading overlay...")
ol = Overlay('/home/xilinx/arm-on-zynq/overlay/hello.bit')
print("Discovered IPs:", list(ol.ip_dict.keys()))

print("--> Testing LEDs...")
gpio = ol.axi_gpio_leds
gpio.write(0x0, 0x0F)
time.sleep(0.5)
gpio.write(0x0, 0x00)

print("--> Reading 32-bit counter...")
counter = ol.counter_0
c1 = counter.read(0x0)
time.sleep(0.05)
c2 = counter.read(0x0)

print(f"Sample 1: {c1}")
print(f"Sample 2: {c2}")
print(f"Delta:    {c2 - c1} clock ticks")
