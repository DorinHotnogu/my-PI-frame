import time
import argparse
from rpi_ws281x import PixelStrip, Color

# Configuration
LED_COUNT = 63
LED_PIN = 18
LED_FREQ_HZ = 800000
LED_DMA = 10
LED_BRIGHTNESS = 128
LED_INVERT = False
LED_CHANNEL = 0

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def wheel(pos):
    if pos < 85:
        return Color(pos * 3, 255 - pos * 3, 0)
    elif pos < 170:
        pos -= 85
        return Color(255 - pos * 3, 0, pos * 3)
    else:
        pos -= 170
        return Color(0, pos * 3, 255 - pos * 3)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', type=str, default='static', choices=['static', 'chase', 'rainbow', 'wipe', 'off'])
    parser.add_argument('--color', type=str, default='#ff0000')
    parser.add_argument('--brightness', type=int, default=128)
    parser.add_argument('--speed', type=int, default=50)
    parser.add_argument('--count', type=int, default=63)
    parser.add_argument('--crossfade', action='store_true')
    args = parser.parse_args()

    strip = PixelStrip(args.count, LED_PIN, LED_FREQ_HZ, LED_DMA, LED_INVERT, args.brightness, LED_CHANNEL)
    strip.begin()

    if args.mode == 'off':
        for i in range(strip.numPixels()):
            strip.setPixelColor(i, Color(0, 0, 0))
        strip.show()
        return

    r, g, b = hex_to_rgb(args.color)
    color = Color(r, g, b)
    delay = (101 - args.speed) / 1000.0

    if args.mode == 'static':
        for i in range(strip.numPixels()):
            strip.setPixelColor(i, color)
        strip.show()
    
    elif args.mode == 'chase':
        while True:
            for i in range(strip.numPixels()):
                for j in range(strip.numPixels()):
                    strip.setPixelColor(j, Color(0, 0, 0))
                strip.setPixelColor(i, color)
                strip.show()
                time.sleep(delay)

    elif args.mode == 'wipe':
        while True:
            for i in range(strip.numPixels()):
                strip.setPixelColor(i, color)
                strip.show()
                time.sleep(delay)
            for i in range(strip.numPixels()):
                strip.setPixelColor(i, Color(0, 0, 0))
                strip.show()
                time.sleep(delay)

    elif args.mode == 'rainbow':
        while True:
            for j in range(256):
                for i in range(strip.numPixels()):
                    strip.setPixelColor(i, wheel((int(i * 256 / strip.numPixels()) + j) & 255))
                strip.show()
                time.sleep(delay)

if __name__ == '__main__':
    main()
