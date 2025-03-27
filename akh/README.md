# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Setting up Google Maps API Key for Qibla Direction Finder

The Qibla Direction Finder component requires a Google Maps API key to function properly. Follow these steps to set it up:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the "Maps JavaScript API" for your project
4. Create an API key
5. Copy the `.env.example` file to `.env` and replace the placeholder with your API key:

```bash
cp .env.example .env
```

Then edit the `.env` file and replace `your_google_maps_api_key_here` with your actual API key:

```
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

The Qibla component will now be able to load the Google Maps API and display the direction to the Kaaba from your current location.

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
