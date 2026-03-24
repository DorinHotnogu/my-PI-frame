# Ghid de Instalare PiFrame Pro pe Raspberry Pi

Acest ghid te va ajuta să instalezi și să configurezi aplicația pe Raspberry Pi-ul tău (192.168.100.93).

## 1. Pregătire Raspberry Pi
Asigură-te că ai Node.js instalat (recomandat v18+):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential
```

## 2. Clonare și Instalare
```bash
git clone <URL_REPOSITORI_TAU> piframe
cd piframe
npm install
```

## 3. Configurare SSL (Certificat de Încredere)
Pentru a evita mesajele de avertizare pe telefon, vom folosi `mkcert`.

**Pe calculatorul tău (nu pe Pi):**
1. Instalează `mkcert` (https://github.com/FiloSottile/mkcert).
2. Rulează: `mkcert -install`
3. Generază certificatul pentru IP-ul Pi-ului:
   `mkcert 192.168.100.93 localhost 127.0.0.1`
4. Vei obține două fișiere: `192.168.100.93.pem` și `192.168.100.93-key.pem`.
5. Copiază-le pe Raspberry Pi în folderul proiectului.

**Instalează Root CA pe Telefon:**
- Trimite-ți fișierul `rootCA.pem` (generat de `mkcert -CAROOT`) pe telefon și instalează-l ca profil de încredere (iOS: Settings > General > About > Certificate Trust Settings).

## 4. Pornire Aplicație cu HTTPS
Modifică `server.ts` pentru a folosi HTTPS sau folosește un reverse proxy ca Nginx.
Cea mai simplă metodă directă în Node:
```typescript
// În server.ts
import https from 'https';
const options = {
  key: fs.readFileSync('192.168.100.93-key.pem'),
  cert: fs.readFileSync('192.168.100.93.pem')
};
https.createServer(options, app).listen(3000);
```

## 5. Pornire Automată la Boot
Folosește `pm2`:
```bash
sudo npm install -g pm2
pm2 start npm --name "piframe" -- start
pm2 save
pm2 startup
```

## 6. Configurare Kiosk Mode (Display)
Pe Raspberry Pi OS Lite, va trebui să instalezi un server grafic minimal (X11) și un browser (Chromium):
```bash
sudo apt-get install --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox chromium-browser
```
Creează un script de pornire `kiosk.sh`:
```bash
#!/bin/bash
xset -dpms
xset s off
xset s noblank
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' ~/.config/chromium/Default/Preferences
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' ~/.config/chromium/Default/Preferences
chromium-browser --noerrdialogs --disable-infobars --kiosk https://localhost:3000/#slideshow
```

## 7. Orientare Portret

## 9. De rulat acasa
'''
pm2 stop rama-foto
pm2 delete rama-foto
cd ~/Pi-Frame-Pro
NODE_ENV=production pm2 start npm --name "rama-foto" -- start
pm2 save
'''



