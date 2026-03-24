from rpi_ws281x import PixelStrip, Color
import time

LED_COUNT = 30
LED_PIN = 18

strip = PixelStrip(LED_COUNT, LED_PIN)
strip.begin()

while True:
    for color in [(255,0,0), (0,255,0), (0,0,255)]:
        for i in range(strip.numPixels()):
            strip.setPixelColor(i, Color(*color))
        strip.show()
        time.sleep(1)
