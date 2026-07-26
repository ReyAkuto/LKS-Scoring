# LKS Robotics Scoring

Web application for recording and monitoring team assessments during the LKS Robotics competition.

This project was built to replace manual paper scoring with a faster and more practical workflow. Judges can record each assessment directly from their device, while the current scoring progress can be monitored in real time from another screen using the viewer page.

The application is designed around the assessment flow used in the competition, so judges only need to focus on checking completed tasks instead of calculating scores manually.

## Features

- Manage participating teams directly from the dashboard
- Checklist-based assessment for each competition stage
- Separate pages for **Admin** and **Viewer**
- Realtime synchronization using Firebase Realtime Database
- Support for configurable bonus cubes
- Live progress tracking during the competition
- Responsive interface for desktop, tablet, and mobile devices

## Assessment

The current assessment flow includes:

- Robot Assembly
- Basic Robot Movement
- Autonomous Mission C1
- Autonomous Mission C2

For C1 and C2, every cube is evaluated through multiple checkpoints, making it easier to record robot actions without missing any part of the mission.

## Project Structure

```
/
├── index.html        # Admin dashboard
├── viewer.html       # Live viewer
├── app.js            # Main application logic
├── firebase.js       # Firebase configuration
├── style.css         # UI styles
└── assets/
```

## Running Locally

Clone the repository:

```bash
git clone https://github.com/<username>/lks-robotics-scoring.git
```

Open the project directory:

```bash
cd lks-robotics-scoring
```

Configure your Firebase project inside `firebase.js`, then serve the project using any local web server.

Example:

```bash
python -m http.server
```

or

```bash
npx serve
```

## Notes

This project is still under active development. The assessment workflow and scoring configuration may change as the official LKS Robotics rules evolve.

Suggestions and improvements are always welcome.