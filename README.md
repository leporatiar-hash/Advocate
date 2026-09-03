This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# truefit-meds

## Omnara / Phone Workflow

Omnara is already supported in this repo with a single-port mobile preview path.

### Normal local dev

```bash
npm run dev:web
npm run dev:backend
```

### Phone-friendly local dev

Omnara live previews currently work best when the app is reachable through one local port. This project normally uses:

- Next.js on `localhost:3000`
- FastAPI on `localhost:8000`

For Omnara/mobile preview, run these in separate terminals from the repo root:

```bash
npm run dev:web:phone
npm run dev:backend
npm run dev:proxy
npm run omnara
```

What this does:

- `dev:web:phone` runs Next.js with `NEXT_PUBLIC_API_URL=/backend`
- `dev:proxy` exposes one local port at `http://localhost:3001`
- requests to `/backend/*` on port `3001` are proxied to the FastAPI app on port `8000`
- everything else on port `3001` is proxied to the Next.js dev server on port `3000`

In Omnara, expose or preview port `3001`.

### Notes

- If Omnara is installed but cannot connect, start it outside any restricted sandbox and run `omnara daemon start`.
- `cloudflared` is optional but may still be useful depending on your Omnara preview setup.
- If you only want remote control of the Codex session from your phone and do not need app preview, `npm run omnara` is enough.
