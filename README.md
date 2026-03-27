# IIT Palakkad Campus Hub

A web app for IIT Palakkad students to quickly check mess menus, bus schedules, and campus timings — all in one place.

**Live site:** [Rizzwan285.github.io/mess_bus_details](https://rizzwan285.github.io/mess_bus_details/)

---

## Features

- **Mess Menu** — 4-week rotating menu with daily breakfast, lunch, snacks, and dinner
- **Bus Schedule** — Weekday, Saturday/holiday, and Sunday timetables for campus, town, and Wise Park routes
- **Mess Timings** — Separate timings for weekdays and weekends
- **Date Preview** — Browse any date's menu and bus schedule
- **Dark Mode** — Toggle between light and dark themes
- **Real-time Clock** — Live time display with next-bus countdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui (Radix UI) |
| Routing | React Router v6 |
| Date Handling | date-fns + date-fns-tz |
| Deployment | GitHub Pages via gh-pages |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Rizzwan285/mess_bus_details.git
cd mess_bus_details

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Build for production (outputs to `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Build and deploy to GitHub Pages |

---

## Project Structure

```
mess_bus_details/
├── public/              # Static assets (favicon, images, robots.txt)
├── src/
│   ├── components/
│   │   ├── features/    # BusScheduleCard, MessMenuCard, MessTimingsCard
│   │   ├── layout/      # Header, Footer
│   │   └── ui/          # shadcn/ui components
│   ├── data/
│   │   ├── busData.ts   # All bus routes and schedules
│   │   └── messData.ts  # 4-week rotating mess menu
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utility functions
│   ├── pages/           # Index (dashboard), NotFound
│   ├── utils/
│   │   └── dateUtils.ts # Day-type detection, IST timezone, bus filtering
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Deployment

The app is deployed to GitHub Pages. To deploy a new version:

```bash
npm run deploy
```

This runs the production build and pushes the output to the `gh-pages` branch automatically.

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.
