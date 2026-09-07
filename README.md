# Zalo Mini App

## Foundation validation

The public product-viewer foundation uses only the G0 public API contract. In a DEV build it uses the explicitly labelled empty fixture; UAT and Production require a configured public API and never enable that fixture. No operational values or secrets belong in source.

Run the checks before a hand-off:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Development

### Using Zalo Mini App Extension

1. Install [Visual Studio Code](https://code.visualstudio.com/download) and [Zalo Mini App Extension](https://mini.zalo.me/docs/dev-tools).
1. In the **Home** tab, process **Config App ID** and **Install Dependencies**.
1. Navigate to the **Run** tab, select the suitable launcher, and click **Start**.

### Using Zalo Mini App CLI

1. [Install Node JS](https://nodejs.org/en/download/).
1. [Install Zalo Mini App CLI](https://mini.zalo.me/docs/dev-tools/cli/intro/).
1. **Install dependencies**:
   ```bash
   npm install
   ```
1. **Start** the dev server:
   ```bash
   zmp start
   ```
1. **Open** `localhost:3000` in your browser.

## Deployment

### Temporary DEV preview on other devices

When the public Catalogue backend is not available yet, use the explicitly labelled **DEV preview** build below. It contains only the bundled DEV UI fixture and is uploaded as a Zalo testing version; it is not UAT or Production data.

```bash
npm run deploy:dev-preview
```

Do not use this command for a UAT/Production release. Once the public backend is ready, configure `VITE_PUBLIC_API_BASE_URL` in the release environment and use the normal `npm run build` / `zmp deploy` flow.

### Backend integration preview

The backend test origin is configured only in `.env.backend-preview` and contains no credentials. Use it to test the real public Catalogue flow after the backend allows the Mini App's browser origin through CORS:

```bash
npm run start:backend-preview
npm run deploy:backend-preview
```

1. **Create** a mini program. For instructions on how to create a mini program, please refer to the [Coffee Shop Tutorial](https://mini.zalo.me/tutorial/coffee-shop/step-1/)

1. **Deploy** your mini program to Zalo using the mini app ID created.

   - **Using Zalo Mini App Extension**: navigate to the **Deploy** panel > **Login** > **Deploy**.
   - **Using Zalo Mini App CLI**:
     ```bash
     zmp login
     zmp deploy
     ```

1. Open the mini app in Zalo by scanning the QR code.

## Resources

- [Zalo Mini App Official Website](https://mini.zalo.me/)
- [ZaUI Documentation](https://mini.zalo.me/documents/zaui/)
- [ZMP SDK Documentation](https://mini.zalo.me/documents/api/)
- [DevTools Documentation](https://mini.zalo.me/docs/dev-tools/)
- [Ready-made Mini App Templates](https://mini.zalo.me/zaui-templates)
- [Community Support](https://mini.zalo.me/community)
