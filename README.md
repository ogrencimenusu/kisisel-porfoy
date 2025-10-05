# React + Firebase Hosting Project

Modern React application built with Vite and deployed on Firebase Hosting.

## Features

- ⚛️ Built with React 19
- ⚡ Powered by Vite for fast development
- 🔥 Deployed on Firebase Hosting
- 📱 Responsive design with modern UI
- 🎨 Beautiful gradient backgrounds and glassmorphism effects

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase CLI

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open your browser and visit `http://localhost:5173`

### Firebase Configuration

1. Update `src/firebase.js` with your Firebase project configuration
2. Update `.firebaserc` with your Firebase project ID

### Deployment

1. Build the project:
```bash
npm run build
```

2. Deploy to Firebase:
```bash
firebase deploy
```

Or use the combined command:
```bash
npm run deploy
```

## Project Structure

```
├── public/
│   └── vite.svg
├── src/
│   ├── App.jsx          # Main React component
│   ├── App.css          # Styles
│   ├── firebase.js      # Firebase configuration
│   └── main.jsx         # Entry point
├── firebase.json        # Firebase hosting configuration
├── .firebaserc          # Firebase project configuration
└── package.json         # Dependencies and scripts
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run deploy` - Build and deploy to Firebase
- `npm run lint` - Run ESLint

## Technologies Used

- React 19
- Vite
- Firebase
- CSS3 with modern features
- ES6+ JavaScript