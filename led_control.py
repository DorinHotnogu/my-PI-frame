import argparse
import json
from rpi_ws281x import PixelStrip, Color

# Configuration
LED_PIN = 18
LED_FREQ_HZ = 800000
LED_DMA = 10
LED_INVERT = False
LED_CHANNEL = 0

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', type=str, default='static', choices=['static', 'ambilight', 'off'])
    parser.add_argument('--color', type=str, default='#ff0000')
    parser.add_argument('--brightness', type=int, default=128)
    parser.add_argument('--count', type=int, default=63)
    parser.add_argument('--colors', type=str, default='[]')
    args = parser.parse_args()

    strip = PixelStrip(args.count, LED_PIN, LED_FREQ_HZ, LED_DMA, LED_INVERT, args.brightness, LED_CHANNEL)
    strip.begin()

    if args.mode == 'off':
        for i in range(strip.numPixels()):
            strip.setPixelColor(i, Color(0, 0, 0))
        strip.show()

    elif args.mode == 'static':
        hex_color = args.color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        for i in range(strip.numPixels()):
            strip.setPixelColor(i, Color(r, g, b))
        strip.show()

    elif args.mode == 'ambilight':
        try:
            colors = json.loads(args.colors)
            for i in range(min(len(colors), strip.numPixels())):
                c = colors[i]
                r = (c >> 16) & 0xFF
                g = (c >> 8) & 0xFF
                b = c & 0xFF
                strip.setPixelColor(i, Color(r, g, b))
            strip.show()
        except Exception as e:
            print(f"Ambilight mode error: {e}")

if __name__ == '__main__':
    main()
