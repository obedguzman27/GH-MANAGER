# GH Manager para el App Store (iPhone)

Este folder es la app de iPhone. Por dentro es la misma GH Manager (los mismos
datos en la nube), pero instalada como app normal desde el App Store.

## Lo que necesitas
1. **Una Mac** con **Xcode** (gratis en la Mac App Store). Para iPhone no hay otra forma: Apple solo deja compilar en Mac.
2. **Cuenta de Apple Developer**: $99 al año en https://developer.apple.com/programs/ (puede ser a nombre de GUZMAN HVAC; para compañía piden número D-U-N-S, que es gratis).
3. **Node.js** en la Mac: https://nodejs.org

## Pasos (en la Mac)
```
git clone https://github.com/obedguzman27/GH-MANAGER.git
cd GH-MANAGER/app-iphone
npm install
npm run preparar     # arma la app con la última versión
npm run abrir        # abre el proyecto en Xcode
```
En Xcode:
1. Toca **App** (arriba a la izquierda) → **Signing & Capabilities** → en **Team** elige tu cuenta de Apple Developer.
2. Conecta tu iPhone y dale ▶ para probarla en tu teléfono.
3. Para subirla: menú **Product → Archive** → **Distribute App** → **App Store Connect**.

## En App Store Connect (https://appstoreconnect.apple.com)
- Crea la app: nombre **GH Manager**, Bundle ID **com.guzmanhvac.ghmanager**.
- Política de privacidad: https://obedguzman27.github.io/ghmanager/privacidad.html
- Privacidad de datos: "datos no vinculados para rastreo"; no hay anuncios.
- **Cuenta de prueba para Apple**: Apple pide un usuario y contraseña para revisar la app. Crea un usuario de prueba con datos inventados (no les des tu cuenta real).
- Fotos de pantalla de iPhone 6.7" (se pueden tomar del simulador de Xcode).
- Si es solo para tu compañía, puedes elegir distribución **privada/no listada** (Unlisted) para que no salga en búsquedas.

## Cada vez que haya versión nueva
`npm run preparar`, en Xcode sube el **Build** (General → Build) y vuelve a hacer **Archive**.
