# OneIlalim

### Smart Infrastructure Application for Integrated Disaster Intelligence and Evacuation Coordination

## Overview

**OneIlalim** is a smart infrastructure application designed to enhance disaster response and evacuation coordination in Barangay New Ilalim.
It leverages **IoT-enabled cameras** and **geospatial technologies** to provide real-time monitoring, reporting, and management of disaster-related incidents.

The platform enables collaboration between residents and barangay officials, improving situational awareness and decision-making during emergencies.

---

## Features

### Interactive Map & Disaster Reporting

* Report incidents such as:

  * Fire
  * Accidents
  * Floods
  * Hazards
* Real-time visualization of reports using an interactive map
* Officials can resolve and remove reports

### Live Camera Monitoring

* Real-time riverbank camera feed
* Supports flood monitoring and early warning

### Weather Monitoring & Announcements

* Displays weather forecasts
* Officials can publish announcements and advisories

### Disaster History *(Officials Only)*

* Centralized archive of all reported incidents
* Useful for disaster analysis and planning

### Inventory Management *(Officials Only)*

* Tracks barangay resources and emergency supplies
* Supports efficient evacuation and response logistics

---

## User Roles

### Residents

* Submit disaster reports
* View map, camera feed, and weather updates

### Barangay Officials

* Full system access
* Manage and resolve reports
* Post announcements
* Access history and inventory

---

## Tech Stack

* **Frontend:** Next.js
* **Backend / Database:** Supabase
* **Mapping:** Leaflet
* **Hardware Integration:** IoT Cameras (River Monitoring)

---

## Installation

```bash
git clone https://github.com/CuencoDon/OneIlalim.git
cd OneIlalim
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open in browser:

```
http://localhost:3000
```

---

## Configuration

Create a `.env.local` file and configure your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
```

---

## Usage

* **Map Tab:** Report and monitor disasters
* **Camera Tab:** View live river conditions
* **Weather Tab:** Check forecasts and announcements
* **History Tab:** *(Officials only)* View past incidents
* **Inventory Tab:** *(Officials only)* Manage resources

---

## Access Control

Role-based access ensures that sensitive features are restricted to barangay officials:

* Disaster history
* Inventory management
* Report resolution
* Weather announcements

---

## Objectives

* Improve disaster response time
* Enhance coordination between residents and officials
* Provide real-time situational awareness
* Strengthen community disaster preparedness

---

## Authors

* Caras, Eyron G.
* Cuenco, Don Miguel L. Cuenco

---

## Contact

* Caras, Eyron G. - 202311553@gordoncollege.edu.ph
* Cuenco, Don Miguel L. Cuenco - 202310423@gordoncollege.edu.ph