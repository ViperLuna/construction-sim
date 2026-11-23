# Construction Sim: Design Document

> Living document, updated as the roundtable talks continue.
>
> **Status legend:** **[LOCKED]** decided by the owner · **[PROPOSED]** suggested, not yet confirmed · **[OPEN]** unanswered question
>
> All numbers (prices, times, rates) are **starting guesses to be tuned** once the game is playable unless marked otherwise.

## Table of Contents

1. [Vision](#1-vision)
2. [Technical Foundation](#2-technical-foundation)
3. [Time, Weather and Seasons](#3-time-weather-and-seasons)
4. [The Town (Map and Traffic)](#4-the-town-map-and-traffic)
5. [Player Property](#5-player-property)
6. [Crew](#6-crew)
7. [Vehicles, Equipment and Fuel](#7-vehicles-equipment-and-fuel)
8. [Jobs](#8-jobs)
9. [Money and the Economy](#9-money-and-the-economy)
10. [Screens and UI](#10-screens-and-ui)
11. [Saving, Title Screen and Installation](#11-saving-title-screen-and-installation)
12. [Build Order](#12-build-order)
13. [Open Questions](#13-open-questions)
14. [Appendix: Job Catalog](#14-appendix-job-catalog)

---

## 1. Vision

A top-down 2D landscaping/construction business sim, played in the browser and hosted on GitHub Pages. The player runs a small crew company in a small town. They accept jobs, schedule crews, drive trucks to real addresses, buy materials, and watch the work get built piece by piece on the map. Work starts simple (mowing) and grows into landscaping, hardscaping and eventually full construction with heavy equipment.

**Tone:** cozy but with real business tension. Every job should raise the question "is this actually worth it?"

---

## 2. Technical Foundation

- **[LOCKED]** Hosted on **GitHub Pages** (static files only, deployed via GitHub Actions).
- **[LOCKED]** **Top-down 2D.**
- **[LOCKED]** **Simple, lightweight visuals:** flat, clean 2D shapes and sprites. No realism and nothing heavy on the GPU. Some lag is acceptable, but it must run well on mobile.
- **[LOCKED]** Persistence through **browser storage** (localStorage and/or IndexedDB). No server.
- **[LOCKED]** **Customization is a goal:** make as much as possible configurable (hours, names, settings).
- **[LOCKED]** A **config file** holds tunable values. First entry: `secondsPerGameHour` (see 3.1).
- **[PROPOSED]** Plain HTML/CSS/JS with Canvas, no framework required. Revisit before coding.
- **[PROPOSED]** Three strictly separated layers:
  1. **Simulation:** clock, calendar, crews, jobs, money, weather. Numbers only, no drawing.
  2. **World:** map, streets, addresses, road graph.
  3. **Presentation:** truck animation, staged work visuals, UI. It only plays back what the simulation decided.
- **[PROPOSED]** All content (job types, materials, crew names, map lots, equipment) lives in **data files**, so new content never needs engine changes.
- **[PROPOSED]** Save data is **versioned** so old saves can migrate as the game changes.

---

## 3. Time, Weather and Seasons

### 3.1 Clock and pace
- **[LOCKED]** The player sets business hours. **Default: 7:00 AM to 5:00 PM, Monday to Friday.**
- **[LOCKED]** **Normal pace: 1 real minute = 1 in-game hour** (a 10-hour shift is about 10 real minutes). Configurable via `secondsPerGameHour`, with **60 as both the default and the minimum**. Higher values slow the game down.
- **[LOCKED]** Pause and fast-forward controls exist.
- **[LOCKED]** **Skip idle time:** during the shift, when the crew is home with nothing due, a button skips ahead to the next scheduled job, or to quitting time if nothing else is scheduled. It's never automatic and not offered while a crew is out working. (Crew on the clock are still paid for the skipped time.)
- **[LOCKED]** **After-hours skip:** when nobody is working, the player can skip ahead. It is **always manual**, available at the end of the shift only, because the player may want to hire, buy or configure things before the next day starts. Nothing auto-advances past end of shift.

### 3.2 Weather
- **[LOCKED]** Rain, snow, wind and so on happen occasionally.
- **[LOCKED]** Weather **hinders certain jobs and makes them take longer.**
- **[PROPOSED]** Each job type has weather sensitivities. Weather either multiplies the time or blocks the job entirely, bumping it to the next workable day.
- **[PROPOSED]** A simple **forecast** (1-3 days out) shown on the calendar so the player can plan.

### 3.3 Seasons and snow
- **[LOCKED]** The game has **seasons**, including **winter with snow work**.
- **[LOCKED]** Snow work **starts small and grows**:
  1. Shovel walks and driveways (solo, basic tools)
  2. Plow truck (blade on a truck) for driveways and lots
  3. Larger plow truck
  4. **Salt/plow truck** for **streets**
- **[PROPOSED]** Seasonal swing: fall = leaf cleanup rush, winter = snow work and slow landscaping, spring = mulch/planting/cleanup rush, summer = mowing peak and storm cleanup. Players who don't plan for winter income will be paying idle crews.

---

## 4. The Town (Map and Traffic)

### 4.1 Map basics
- **[LOCKED]** Small-scale visuals, but a map **large enough to matter**. Zoom in and out is supported everywhere.
- **[LOCKED]** **Real street names and real addresses.** Every job goes to an actual address on the map.
- **[LOCKED]** **Street naming:** plain, familiar, "every town has one" names (Main St., Prospect, State, Market, Exchange, Oakwood...), plus numbered parallel streets (1st, 2nd, 3rd...). No silly or hard-to-remember names. Street names **never change**, so players learn the town over time.
- **[PROPOSED]** About **100-150 addressable lots** at launch.
- **[PROPOSED]** The map is hand-designed but stored as **data** (grid/tiles plus a road graph), so it can expand later.
- **[LOCKED]** The map layout is the designer's creative call (the owner is "the director").

### 4.2 Areas and places
- **[LOCKED]** Minimum areas: **2 residential neighborhoods**, a **business area**, **downtown**, **farm areas**, and the **player's property**.
- **[LOCKED]** **Neighborhood variety:** one is a **more upper-middle-class area with curves and cul-de-sacs**. Layout freedom (including a diagonal road here or there) goes to the designer, as long as roads and traffic work.
- **[LOCKED]** **Civic buildings:** school, library, police station, fire station, hospital (just a larger building), town hall.
- **[LOCKED]** **Natural features:** a **creek or river with a bridge**, **ponds**, and a **railroad** through town.
- **[LOCKED]** **Supply locations:** a **lumber yard** and a **stone/landscape supply yard** (real places the crew drives to), plus a **hardware store**.
- **[LOCKED]** **Garden center farm:** one farm has a **home and garden center** selling seeds, plants, sod and artificial turf. Other farms are scenery and job sites.
- **[LOCKED]** **The dump:** a place where junk is taken (see 8.8).
- **[LOCKED]** **Baseball field** as a landscaping job site (a flagship job: infield dirt, grass, bases, fencing).
- **[LOCKED]** **Bank:** a **building on the map**, but **all banking is done instantly in the menu** (no driving). The bank can also be a **commercial customer** (landscaping, snow).
- **[LOCKED]** **No rental company on the map.** Rentals are delivered (see 7.3).

### 4.3 Layout plan (draft v2)
- **[PROPOSED]** Named streets run **east-west** (Oakwood, Prospect, Main, Market, Exchange, State). Numbered **Avenues run north-south** (1st-6th).
- **[PROPOSED]** A **railroad** runs east-west between Market and Exchange, with crossings at 2nd, 4th and 6th Ave. A **creek** runs along the west side with a **bridge on State St**.
- **[PROPOSED]** **Neighborhood A** (grid, working class) in the northwest. **Neighborhood B** (curvy, upper middle) in the northeast. **Park and ballfield** in the middle. **Downtown** in the center. **Business area** (lumber yard, stone yard, hardware, fuel depot) south of the tracks. **Farms** around the edges. **Cemetery** by the north farmland. **Hospital** on the east side. **Dump** on the east/southeast edge.
- **[LOCKED]** **Player property** is in the **rural southwest**, far enough out to have room to expand.

```
                         N
   FARMS (cemetery)  | 1st  2nd  3rd  4th  5th  6th |  FARMS
Oakwood St ----------+----+----+----+----+----+----+-----------
   NEIGHBORHOOD A    |  PARK +      |   NEIGHBORHOOD B
   (grid, working    | BALLFIELD    |   (curvy, cul-de-sacs,
   class)            |              |    pond, upper middle)
Prospect St ---------+----+----+----+----+----+----+--- Hospital (E)
   school  library   church   houses    |
Main St -------------+----+----+----+----+----+----+-----------
   DOWNTOWN: town hall, police, fire, bank, shops
Market St -----------+----+----+----+----+----+----+-----------
===== RAILROAD (crossings at 2nd, 4th, 6th Ave) ================
Exchange St ---------+----+----+----+----+----+----+-----------
   BUSINESS AREA: lumber yard, stone yard, hardware, fuel depot
State St ------------+----+----+----+----+----+----+-----------
   ~~~ creek ~~~ (bridge on State St)   FARM COUNTRY  (dump: SE)
   YOUR PROPERTY (southwest, past the bridge)  garden center farm
```

### 4.4 Map scale
- **[LOCKED]** The map is **not** scaled to real-world distances. Truck speed (tiles per second) is tuned for **how it looks**, and drive time is derived from route length and speed.
- **[PROPOSED]** Typical trips take **10-30 game minutes** (about 10-30 real seconds). Farm trips are longer (about 30-45 real seconds). Fast-forward is available for boring drives.
- **[PROPOSED]** Fuel is burned **per tile driven**.

### 4.5 Service points and parking
- **[LOCKED]** Every location (the property, each store, the dump) has **designated service points** where vehicles go to do their business. The vehicle arrives, parks for a short time, materials appear in (or junk disappears from) the truck, and it drives off. No manual loading minigame.
- **[LOCKED]** The player's work vehicles **park on the street in front of the job site**. If an AI car is parked in that spot, it **drives away before the player arrives**. Traffic keeps clear of reserved job spots.

### 4.6 AI traffic
- **[LOCKED]** The town has **random AI traffic** alongside the player's trucks.
- **[LOCKED]** **Everyone obeys traffic laws**: speed limits, **stop signs, traffic lights**, right of way, keeping distance. Vehicles do **not** drive through each other.
- **[LOCKED]** **Density:** downtown busiest, residential lighter, rural lightest. **Rush hour** brings heavier traffic toward downtown.
- **[LOCKED]** **AI cars fade in and out at driveways and parking lots** (appear, drive to a destination, park, fade out). No cars phasing through buildings.
- **[LOCKED]** Traffic **delays the player's trucks**. A truck may **reroute** if stuck; otherwise it deals with it.
- **[PROPOSED]** The scheduler pads drive time to account for average traffic and rush hour.
- **[PROPOSED]** Performance: cap active cars (about 15-30 on screen) and use cheaper handling far from the camera.
- **[PROPOSED]** Parked cars on streets and in driveways as scenery.

### 4.7 Later hindrances (after the foundation works)
- **[LOCKED]** **School bus:** one route, running in the morning rush and again when school lets out (about 2-3 PM). Players can get stuck behind it.
- **[LOCKED]** **Railroad:** trains occasionally block crossings, long enough to be annoying (around 20 cars).
- **[LOCKED]** **No accidents** for now.
- **[PROPOSED]** Pedestrians and other extras are optional later.

---

## 5. Player Property

### 5.1 Basics
- **[LOCKED]** Starts **small**, with room to expand, but large enough to house **4 crew members including the player**.
- **[LOCKED]** The **full property, including all future expansion space, exists on the map from day one.** The undeveloped part is trees and open ground. Trees act as camouflage for space we haven't planned yet.
- **[LOCKED]** The property is **deliberately oversized**, so there's room for expansions nobody has thought of yet.
- **[PROPOSED]** The starting developed area is about **a quarter** of the lot.
- **[PROPOSED]** Clearing trees or land on the player's own property could be an in-game job.

### 5.2 Day-one facilities
- **[LOCKED]** A **fuel pump with a reservoir** (see 7.4).
- **[LOCKED]** A **very small warehouse/storage space**, where delivered orders can be stored (see 5.4).
- **[PROPOSED]** Also: small crew building/office space, small garage or carport, a parking spot for the starting truck, small tool shed.

### 5.3 Crew commute and parking
- **[LOCKED]** Crew do **not** live on the property. Their cars **fade in at the driveway** at clock-in and **fade out** at clock-out. They don't use the town roads, so no employee home addresses are needed (an optional cosmetic home address on a crew card is allowed later).
- **[LOCKED]** **Parking capacity is the crew cap.** More parking is the "more crew" expansion.

### 5.4 Warehouse and storage
- **[LOCKED]** The property eventually has a **warehouse** where ordered materials can be received and stored. A **very small one exists at the start**, and expansions make it bigger.
- **[PROPOSED]** Materials ordered for **delivery** can be sent **to the warehouse** instead of a customer site, so they're on hand before a job is scheduled. Warehouse capacity limits what can be stored.
- **[PROPOSED]** Materials in the warehouse can be loaded into a truck at the property service point (no driving to a store).
- **[OPEN]** Capacity numbers, what materials can be stored, and whether stored materials can spoil (for example, sod).

### 5.5 Expansion list (reserve the space on the map now, design each later)
- **[PROPOSED]**
  - *Early:* bigger garage with more bays, bulk material yard (mulch, gravel, stone), office, bigger fuel tank, bigger warehouse, more crew parking
  - *Mid:* equipment barn/shed, heavy equipment parking, mechanic bay, tool/supply room, dump trailer parking, material bunkers
  - *Late:* large industrial equipment yard, **tree/plant nursery**, **gravel pit or sand quarry**, salt shed, plow truck fleet, business office building (HR/insurance)
  - *Flavor:* pond, fire pit, break lawn, flagpole, company sign by the road
- **[LOCKED]** **Nursery and gravel pit** are in as late-game expansions (the player eventually makes their own materials).

---

## 6. Crew

### 6.1 The player ("Myself")
- **[LOCKED]** The player is a crew member and can be scheduled like anyone else.
- **[LOCKED]** The player has a wide array of capabilities (owner-level skill) but can still only do **one person's worth of work**.
- **[LOCKED]** The player is **not paid hourly**. They own the company, and their income is **whatever profit remains** from jobs. The player has to schedule jobs so the company earns enough to cover their own "salary." It depends on work done, not on showing up.
- **[LOCKED]** The owner has **no salary and no living costs** (no groceries, heat, electric, rent). Home life isn't part of the game, so the owner is **free labor**.
- **[LOCKED]** **Owner hours cap:** to limit exploitation of the unpaid owner, after a set amount of time on the clock **the owner shuts down and goes home**, regardless of how the schedule is built. (Anything still unfinished carries over.)
- **[LOCKED]** **12-hour daily cap for every employee** (owner included). After 12 hours on the clock in a day, they go home.
- **[LOCKED]** Employees can work **7 days a week**, but **long stretches without rest wear them down** and they can **burn out** if they don't get time off.
- **[LOCKED]** **The owner can work 7 days a week, every week, with no burnout** (a bit of exploitation of the owner is fine). The owner can still **slow down without rest**.
- **[PROPOSED]** Two separate effects:
  - **Fatigue** (everyone, owner included): builds with long days and long streaks of working days, recovers with days off, and **slows work speed**.
  - **Burnout** (employees only, owner immune): the same buildup past a limit, which **lowers morale** and can make an employee **quit**.
- **[PROPOSED]** The **Stamina** stat slows both effects.
- **[OPEN]** Exact numbers: how fast fatigue and burnout build and recover, and what they cost in speed and morale.
- **[OPEN]** How the owner's take is defined, if at all: free withdrawals, a player-set draw, or a running profit tally. (Leaning: profit tally with withdrawals.)

### 6.2 Employment and schedules
- **[LOCKED]** Every crew member (including the player) can be scheduled for certain days and hours.
- **[LOCKED]** **Full-time:** works the full business day. The player only chooses **days**.
- **[LOCKED]** **Part-time:** the player chooses **days and hours**.
- **[LOCKED]** Employees are **paid hourly from clock-in to clock-out**, not per job. This includes drive time.
- **[LOCKED]** **Payday is every day:** all employees are **paid at the end of each day** for the hours they clocked. The owner is not paid.
- **[OPEN]** Whether crew are paid while clocked in with no job scheduled. (Probably yes, which punishes under-booking.)

### 6.3 Stats and leveling
- **[LOCKED]** Crew have an **overall level** plus individual stats, each rated **1-10**.
- **[PROPOSED]** Six stats: **Speed** (work pace), **Quality** (job rating, neatness), **Stamina** (holds pace over a long day), **Driving** (fuel economy, time lost in traffic), **Equipment** (needed to operate machines, gates Tier 4 jobs), **Teamwork** (boosts the whole crew's efficiency). Speed and Quality are the two main ones.
- **[PROPOSED]** A hidden **Morale** stat drives raise requests and quitting.
- **[LOCKED]** Crew **earn XP while working**. Level-ups give **points** the player spends on any stat (max 10) by clicking on the crew member. With six stats, **more than one point per level** is allowed, and milestones can award points too.
- **[PROPOSED]** **2 points per level**, plus a **bonus point at milestone levels** (5, 10, 15...).
- **[LOCKED]** Stats can also be raised by **paying for training**, and **training cost rises as the stat gets higher**.
- **[PROPOSED]** Training is an instant, paid +1. The cost scales with the stat's current value (cheap at low values, expensive near 10).
- **[LOCKED]** Points can be **reset to the original stats and re-spent for a price**.
- **[PROPOSED]** Respec price scales with level.

### 6.4 Hiring
- **[LOCKED]** Hiring works like the job board: a **daily pool of applicants**, gacha-style.
- **[LOCKED]** Very good applicants **sometimes appear that the player can't afford yet**, as something to look forward to. The pool **always includes common and uncommon applicants** the player can hire.
- **[PROPOSED]** Rarity tiers (common, uncommon, rare...). Higher **reputation** shifts the odds toward better applicants.
- **[LOCKED]** Each applicant has an **asking starting wage**. The starting low end is **$12/hour**.
- **[LOCKED]** The player can **offer a different wage**, and the applicant accepts or declines. Offering **at or above** the ask **guarantees acceptance**.
- **[PROPOSED]** Offering **less** may be declined, depending on how far below. Applicants may leave the pool at the end of the day.
- **[PROPOSED]** Wage range: **$12/hour** at the bottom up to about **$40-60/hour** for the rarest applicants.

### 6.5 Raises, quitting and insurance
- **[LOCKED]** **Raise requests:** when a worker levels up or hits a milestone, they ask for a raise. The player accepts or declines. Declining lowers morale.
- **[LOCKED]** Crew can **quit**, and **give notice first**.
- **[PROPOSED]** Low morale leads to a **notice of quitting** (for example a 2-day notice). The player can keep them by improving pay or conditions.
- **[LOCKED]** **Insurance** is a **per-day premium paid alongside payroll**, a later-game option. Workers may eventually want to be insured.
- **[PROPOSED]** Insurance improves morale. Unlocked with the HR milestone (see 8.3).

### 6.6 Crew teams
- **[LOCKED]** Crew members are assigned to teams, named **"Crew (n)"** by default and renamable.
- **[LOCKED]** Teams are **auto-created in pairs (2 people)** and can be edited later.
- **[LOCKED]** Some jobs require 2 or more people. They can be done with fewer, but take **mathematically more time**.
- **[PROPOSED]** Understaffed efficiency isn't a straight multiple. For example, a 2-person job done by 1 person takes about 1.6-1.8x as long.
- **[PROPOSED]** A team can only be dispatched with members who are on shift.
- **[LOCKED]** **Crew size is limited by the assigned vehicle's seats.** Larger crews come with larger vehicles.
- **[LOCKED]** **A crew with no vehicle is capped at 2 people.** It can still be assigned to a job, but **cannot leave the property until a vehicle is available** ("bad management, but doable").
- **[PROPOSED]** The calendar flags a crew with no vehicle in **red**. If a job's deadline passes while the crew is stuck, normal late penalties apply.

---

## 7. Vehicles, Equipment and Fuel

### 7.1 Vehicles
- **[LOCKED]** The player starts with a **slow half-ton truck that seats 2**.
- **[LOCKED]** Single-person jobs (mowing, raking, cleaning, hauling junk...) can be done by one person.
- **[LOCKED]** A vehicle is **assigned to one crew at a time** while the player holds it (owned or rented), and can be **reassigned between days**.
- **[PROPOSED]** A vehicle can only be in **one place at a time**. The scheduler never double-books a vehicle, so two crews sharing one vehicle can only work non-overlapping jobs.
- **[PROPOSED]** Vehicles have a **cargo capacity** limiting how many materials and junk loads they carry at once.

### 7.2 Equipment
- **[LOCKED]** **Tools and equipment** (chainsaw, small bulldozer, front loader...) can be **rented or bought**, scaling up to **large industrial equipment much later in the game**.
- **[LOCKED]** Some job offers require equipment or crew the player doesn't have. They show up on the board but can't be accepted yet, which shows what to work toward.

### 7.3 Renting and buying
- **[LOCKED]** **Vehicles and equipment can be rented or purchased.** Both exist.
- **[LOCKED]** **Rental rules:** a **flat daily fee**, **no security deposit** (unless accidents are added much later), **rent as long as wanted, return any time**. Rentals are **delivered the next business day**.
- **[LOCKED]** A 2-seat truck rents for about **$20 a day**.
- **[PROPOSED]** The same rental system covers **trucks and equipment**.
- **[PROPOSED]** Buying is a one-time cost. Owned vehicles can be sold back for less. There's a break-even point where buying beats renting.
- **[PROPOSED]** Starting vehicle prices:

  | Vehicle | Seats | Rent/day | Buy |
  |---|---|---|---|
  | Slow half-ton (starting) | 2 | $20 | $7,500 |
  | Pickup truck | 3 | $35 | $14,000 |
  | Crew-cab truck | 4 | $50 | $24,000 |
  | Cargo van | 6 | $75 | $38,000 |
  | Dump truck | 2 | $120 | $60,000 |

### 7.4 Fuel
- **[LOCKED]** The property has a **fuel pump with a reservoir**, which **starts full**.
- **[LOCKED]** **One fuel type** for everything, at a flat **$3.00 per gallon**.
- **[LOCKED]** Fuel is **ordered**, and delivery takes **one business day**. See 8.7 for the delivery rule. Anyone working weekends has to watch their fuel and order ahead.
- **[PROPOSED]** Reservoir capacity: **500 gallons** at the start (real small tanks run 250-1,000). Upgradeable.
- **[PROPOSED]** The truck burns fuel by distance (about 14-16 mpg-equivalent for the slow half-ton). Equipment burns fuel per hour of use.
- **[PROPOSED]** A truck has its own tank, refilled from the property pump. Running a truck dry strands the crew.
- **[OPEN]** Public gas stations as an emergency option at a higher price?

---

## 8. Jobs

### 8.1 Job offers
- **[LOCKED]** Jobs come from a **daily list of offers**, similar to a gacha-style draw.
  - Mostly easy jobs the player can do now.
  - Some jobs that need more crew, tools or skill than the player has (shown **locked**, with hints on how to unlock).
- **[PROPOSED]** The pool is weighted by job type, company reputation and progression. Offers expire if not accepted.

### 8.2 Job definition (data-driven)
Each job type defines: name and category, minimum and recommended crew size, base work time (one average worker), required equipment and materials, weather sensitivity, pay range and expected quality rating, and a **staged visual build sequence** (see 8.9).

### 8.3 Reputation and business growth
- **[LOCKED]** The company has a **reputation that improves as the player levels up**. Reputation affects which job offers appear.
- **[LOCKED]** Business milestones unlock over time: **insurance** (bigger or riskier jobs), **HR** (larger roster), and **contracts** (larger, recurring or multi-day work).
- **[PROPOSED]** Higher reputation unlocks better-paying clients and bigger jobs. Poor ratings lower it.
- **[OPEN]** Level thresholds, and what each milestone costs and unlocks.

### 8.4 Cost and profit
When viewing an offer, the player sees **offered pay against estimated cost**:
- Labor (hourly wages for all on-the-clock time, including driving)
- Fuel
- Materials (and delivery fees)
- Equipment rental
- Dump fees (see 8.8)
- **[LOCKED]** The player is expected to reject bad jobs. Profitability judgment is core gameplay.

### 8.5 Scheduling
- **[LOCKED]** Accepted jobs are **scheduled automatically** into a day and time block, built from the job's **average completion time plus padding**, so jobs aren't crammed in where they might not finish.
- **[LOCKED]** The block includes **travel time** and other required stops (such as picking up materials or dumping a load).
- **[PROPOSED]** Block length = (base work time ÷ crew efficiency) + drive time + load/setup time + buffer (about 15-25 percent, larger in bad weather).
- **[LOCKED]** On accepting, the job is **auto-assigned to the first available crew** and **auto-placed**.
- **[LOCKED]** If there's time to do the job today, **or at least most of it**, the crew **goes today**. Otherwise it's scheduled for the **next available opening**.
- **[PROPOSED]** "Most" means roughly **60% or more** of the block fits in today's remaining shift.
- **[LOCKED]** The player can **move a job** to another time or crew if it fits.

### 8.6 Completion windows, overruns and ratings
- **[LOCKED]** Jobs have a **completion window** (deadline). **More important jobs have smaller windows but pay more** when finished within them.
- **[LOCKED]** **You can't accept a job that won't be finished before it's due.** The scheduler checks, and the offer stays on the board with the message "Can't take this job: it doesn't fall within the allotted completion time."
- **[LOCKED]** **There is no cap on how many jobs you can line up**, because having work lined up is job security. The only limit is whether each job fits inside its own completion window. Long windows (up to about 3 weeks) exist so a queue can run long.
- **[PROPOSED]** Windows run from 1 to 15 business days (today counts as day 1), due at the end of the shift on the due day. A **1-day window is a RUSH job paying about +25%**, and a 2-day window pays about +10%.
- **[PROPOSED]** A job that still finishes after its window (an overrun) loses about 10% of its pay per business day late, up to 50%, and can hurt rating and reputation.
- **[LOCKED]** If a job isn't finished in its block, it **must be finished the next morning**, and the overrun **lowers the job rating, which lowers pay.**
- **[PROPOSED]** A **planned carryover** (scheduled to span days) is **not penalized**. The penalty applies only when a job runs past its **scheduled** time.
- **[LOCKED]** Each job has an expected rating, and quality matters more the better the crew should be.
- **[PROPOSED]** Rating inputs: crew skill, on-time completion, weather, and whether the job was understaffed.
- **[OPEN]** Window lengths per job type, and bonus percentages.

### 8.7 Materials and deliveries
- **[LOCKED]** Materials (lumber, mulch, stone, seed, sod...) come **two ways**:
  1. **Delivery:** ordered, then **dropped off at the customer's property on the scheduled work date**. It **costs more** (a delivery fee).
  2. **Pickup:** the crew **drives to the store** and pays **material cost only**.
- **[LOCKED]** Any crew with an **available empty truck** can go **pick up materials** at any time. They **stay in the truck** until used.
- **[LOCKED]** **All deliveries (materials, fuel, rentals) happen Monday to Friday only.** To get sod on a Saturday, the crew has to pick it up.
- **[PROPOSED]** Delivery must be **ordered at least one business day ahead**. The scheduler **warns** the player if a job's materials can't arrive in time.
- **[PROPOSED]** Deliveries can also go to the **property warehouse** (see 5.4).
- **[PROPOSED]** Supply stores may be **open Saturdays** (shorter hours) even though they don't deliver.
- **[OPEN]** Delivery fee (flat or percentage), store hours, cargo capacity numbers.

### 8.8 Haul-away and the dump
- **[LOCKED]** For haul jobs, **pay is based on finishing the work at the customer's property** (rating, speed and deadline are judged there), but **the job isn't truly over until the load is hauled to the dump**.
- **[LOCKED]** The dump uses the **same simple service-point animation**: the truck parks, the load disappears after a short time, it drives away.
- **[LOCKED]** **Larger jobs can require multiple dump trips.** A haul job has a **number of loads**, and each load adds a trip with its own drive time, dump time and fee.
- **[PROPOSED]** Dump trips are included in the job's **scheduled block** and **cost estimate**. A **dump fee** per load is shown on the job board.
- **[PROPOSED]** A truck carries a **limited number of loads**. An undumped load stays on the truck and **blocks further haul jobs** until dumped.
- **[OPEN]** Dump fee, opening hours, and whether the dump trip must happen the same day.

### 8.9 Visual build sequence
- **[LOCKED]** Work is **displayed on the map**. Pieces appear a little at a time as the job progresses.
- **[LOCKED]** Visuals look a bit "half-assed" in progress, then turn out finished. Example: a flower bed goes from marked out, to dug, to edging placed piece by piece, to soil, to plants.
- **[PROPOSED]** Visual progress is tied to simulated job progress. Crew skill affects the final look (crooked edging for sloppy crews).
- **[LOCKED]** Every job type must be representable on the map.

### 8.10 Recurring customers
- **[LOCKED]** Some jobs (especially **mowing**) can be **recurring customers**, for example "mow every week."
- **[LOCKED]** The **player can cancel** a recurring customer, for instance when bigger jobs need the time slot. **Customers can cancel on their own**, like real life.
- **[PROPOSED]** Recurring offers appear on the **main job board** with a **Recurring** tag. Accepting one creates a **standing appointment** on the calendar: a repeating block that **reserves that slot** every week. Cancelling frees it.
- **[PROPOSED]** Reasons a customer cancels: repeated low ratings, missed or late visits, moving away, random churn. Cancelling on them costs a small reputation hit.
- **[OPEN]** Notice periods, whether prices can be raised on recurring customers, and how many can be active at once.

---

## 9. Money and the Economy

### 9.1 Format
- **[LOCKED]** **All money is whole dollars (integers).** No cents anywhere.
- **[LOCKED]** The **HUD shows short form** (for example **$1.54M**). The **money screen shows the full amount** with commas (**$1,540,391**).
- **[PROPOSED]** Wages, fuel and other fractional amounts are **calculated and rounded to the nearest whole dollar when paid**, never mid-job.
- **[PROPOSED]** Standard JavaScript numbers are sufficient (integers are safe to about 9 quadrillion).

### 9.2 Money in and out

| Money in | Money out |
|---|---|
| Job payments (modified by rating and deadlines) | Hourly crew wages (clock-in to clock-out) |
| | Fuel ($3/gal) |
| | Materials and delivery fees |
| | Dump fees |
| | Vehicle and equipment rentals and purchases |
| | Insurance premiums (later) |
| | Training and respec fees |
| | Property upgrades |
| | Loan repayments and interest |

The player (as owner) is paid from what remains (see 6.1).

### 9.3 Debt, loans and losing
- **[LOCKED]** The player **can lose**. Going into the red starts a countdown.
- **[LOCKED]** The player can **borrow from the bank at interest** (done instantly in the menu). Interest is kept reasonable.
- **[LOCKED]** Modeled on real life: **small loans cost more, big loans cost less.** Big lenders won't touch small amounts for new borrowers, predatory lenders happily will, and large loans have lower rates thanks to longer terms and a qualified borrower.
- **[PROPOSED]** Three loan types:

  | Loan | Amount | Cost | Catch |
  |---|---|---|---|
  | **Cash advance** (the loan shark) | ~$100-$1,000 | Flat fee, ~$20-25 per $100 | Short term (a few days). Anyone qualifies. |
  | **Small bank loan** | ~$1,000-$5,000 | Moderate interest | Needs some reputation. |
  | **Business loan** | ~$10,000+ | Lowest interest, long term | Needs strong reputation (and later insurance, contracts). |
- **[PROPOSED]** Qualification for better loans is tied to **reputation**.
- **[PROPOSED]** Failure: if the balance stays negative for a set number of days, the business fails (game over). The grace period is shown clearly in the UI.
- **[OPEN]** Grace period length, exact loan amounts, rates and terms, repayment rules, and what game over does (ends the save, or a restart with a penalty).

---

## 10. Screens and UI

### 10.1 HUD (always visible)
- **[PROPOSED]** Top bar: date and time, weather, **money (short form)**, **fuel**, and the **speed controls** (pause, 1x, 2x, 4x).
- **[PROPOSED]** Bottom nav: **Map, Jobs, Calendar, Crew, Money, Property**.
- **[LOCKED]** An **"End Day" button appears when the last crew clocks out**. Nothing advances until the player presses it.
- **[LOCKED]** **Mobile-friendly:** icons on small screens, speed controls collapsed.
- **[LOCKED]** Extra HUD items (reputation, loan warning, next-job countdown) are added later as needed.

### 10.2 Calendar
- **[LOCKED]** Shows **jobs by day and who is working**, plus the **forecast**.
- **[PROPOSED]** **Adaptive layout:** on wide screens, crews run down the side and days across a week. On phones, one day at a time (a 7 AM-5 PM timeline) with a week strip on top showing weather and how full each day is.
- **[PROPOSED]** Tapping a day opens the **day timeline** (jobs, drive time, buffer). Tapping a job shows address, assigned crew, materials, cost estimate and **cancel**.
- **[PROPOSED]** Color coding: green (comfortable), yellow (tight), red (may overrun or no vehicle).

### 10.3 Job board
- **[PROPOSED]** Each offer shows: address, job type and star rating (size/difficulty), **pay, estimated cost and estimated profit**, work time, drive time, due date, requirements, and **Accept / Decline**.
- **[LOCKED]** **Costs are shown by default.** A **setting hides them** (harder mode), off by default.
- **[LOCKED]** Jobs the player **can't do yet** appear locked, with what's missing and how to get it.
- **[PROPOSED]** Short-window jobs are tagged **RUSH** and pay more. The board refreshes daily with a countdown.
- **[LOCKED]** **Many sorting options**, even quirky ones, because players think differently.
- **[PROPOSED]** Sort by: pay, profit, profit per hour, due date, distance, drive time, work time, job size, rush first, newest, alphabetical by street.
- **[PROPOSED]** Filters: job category, can-do-now vs locked, needs materials, needs equipment, recurring only, neighborhood, pay range.

### 10.4 Crew screen
- **[PROPOSED]** Three tabs: **Roster, Teams, Hiring**.
- **[PROPOSED]** Top banners show **resignation notices** and **raise requests** with quick actions.
- **[PROPOSED]** **Roster:** a card per person (player first) showing level, XP, the six stats, wage, morale, employment type and schedule, **unspent points**, and buttons **Train, Schedule, Spend points, Fire**.
- **[PROPOSED]** **Teams:** each crew shows its name (renamable), members, assigned vehicle, schedule and today's jobs. **+ Add member** moves people between crews.
- **[PROPOSED]** **Hiring:** the daily applicant pool with **rarity by color and icon**, stats, asking wage, an **offer box** (with an acceptance hint) and **Hire**. Rare applicants the player can't afford appear **locked**.

### 10.5 Other screens (to be designed)
- **[OPEN]** **Money screen** (bank, loans, income and expenses), **Property screen** (upgrades, warehouse, fuel ordering, rentals and purchases), **Map view** (zoom, follow a truck, tap a house).

### 10.6 Settings
- **[LOCKED]** A **Settings** screen exists. Planned so far: `secondsPerGameHour`, **hide job costs** toggle (default off), and **keybinds** (to be designed later).
- **[OPEN]** Full settings list and keybind scheme.

---

## 11. Saving, Title Screen and Installation

### 11.1 Saving
- **[LOCKED]** Saves live in the browser via local storage and/or IndexedDB.
- **[PROPOSED]** **Autosave at end of day**, plus manual save and **export/import of save files**.
- **[PROPOSED]** Ask the browser for **persistent storage** so saves are less likely to be cleared.
- **[LOCKED]** On some phones, **browser storage and the installed app's storage are separate**, so a save made in the browser may not appear in the installed app. **Export/import** is the answer.

### 11.2 Title screen
- **[LOCKED]** A **title/splash screen** appears first. Placeholder for now: **Title, Version, Play, Full Screen, Settings**, with room for more later.
- **[LOCKED]** Pressing **Play** is the user gesture that **allows sound** to start (browsers block audio until the player interacts). Sound itself comes later.
- **[PROPOSED]** The full-screen button uses the browser Fullscreen API where supported. iPhone Safari doesn't support it for pages, but an **installed web app launches full-screen** anyway.

### 11.3 Installable web app (PWA)
- **[LOCKED]** The game is **installable** (add to home screen) so players don't have to keep visiting the URL. This is a priority for the owner.
- **[LOCKED]** The **app icon is a traffic cone**.
- **[PROPOSED]** A **web app manifest** and **service worker** make the game work **offline** after the first load.
- **[PROPOSED]** The site is served from a repo sub-path (`/construction-sim/`), so the manifest and service worker use **relative paths**.

---

## 12. Build Order

Nothing gets coded until the design settles. When it does, build in small, playable slices:

1. **Map and truck:** one road, a few lots, a truck driving between addresses (with title screen and installable shell).
2. **Clock and calendar:** day/hour flow, business hours, manual end-of-day skip.
3. **First job:** one mowing job end to end, with staged visuals and pay.
4. **Money and costs:** wages, fuel, pump and reservoir, job profit screen.
5. **Crew:** hiring, schedules, teams, vehicles, ratings.
6. **Job board:** daily offers, more job types, materials, supply yards and the dump.
7. **Traffic, weather and overruns.**
8. **Rentals, purchases and property expansion** (including the warehouse).
9. **Seasons and snow, recurring customers, loans.**
10. **Full map, polish, saves.**

---

## 13. Open Questions

**Money and business**
1. Owner pay: free withdrawals, a player-set draw, or a profit tally?
2. Loan details: grace period, exact amounts, rates, terms, and what game over does.
3. Reputation: level thresholds, and what insurance, HR and contracts each cost and unlock.
4. Are crew paid while clocked in with no job?

**World and logistics**
5. Fuel: confirm the 500-gallon start; public gas stations or not?
6. Delivery fee (flat or percentage), store hours, cargo capacity numbers.
7. Dump fee, hours, and whether the dump trip must happen the same day.
8. Warehouse: capacity, storable materials, spoilage (for example, sod).
9. Recurring customers: notice periods, price raises, how many at once.
10. Completion window lengths and bonus percentages per job type.

**Game and UI**
11. Money, Property and Map-view screens to design.
12. Settings list and keybinds.
13. XP curve and level thresholds.
14. A balancing pass on job times, prices and material costs once the game runs.
15. More jobs to add to the catalog.

**Resolved so far:** failure states (the player can lose), day length (60 s/hour, configurable), art style (simple), reputation (exists), vehicle assignment (one crew at a time), rentals (delivered, flat daily fee), banking (instant in the menu), property layout rules (oversized, room to spare).

---

## 14. Appendix: Job Catalog

Times are for **one average worker** and are starting guesses only. "Weather" is what hurts the job most. "Stages" is the visual build sequence.

### Tier 1: Solo, half-ton truck, basic tools
| Job | Time | Crew (min/best) | Materials | Weather | Stages |
|---|---|---|---|---|---|
| Mow lawn | 1 h | 1/1 | none | rain | Stripes appear across the grass |
| Rake leaves | 1.5 h | 1/2 | bags | rain, wind | Scattered leaves, then raked piles, then bagged |
| Trim hedges / weed-eat | 1 h | 1/1 | none | rain | Shrubs square off, edges cleaned |
| Weed / bed cleanup | 1.5 h | 1/2 | none | rain | Weeds vanish one by one |
| Gutter cleaning | 1 h | 1/2 | none | rain, wind | Debris cleared along the roofline |
| Pressure wash drive/deck | 2 h | 1/1 | none | freezing | A clean stripe sweeps across the grime |
| Junk haul / cleanout | 2 h | 1/2 | dump fee | rain | Junk pile loaded into the truck bed |
| Seasonal yard cleanup | 3 h | 1/2 | bags | rain, wind | Combination of raking, trimming, hauling |
| Shovel walks/driveway | 1 h | 1/2 | none | n/a (needs snow) | Snow cleared in lanes |

### Tier 2: Small materials jobs
| Job | Time | Crew (min/best) | Materials | Weather | Stages |
|---|---|---|---|---|---|
| Mulch a bed | 2 h | 1/2 | mulch | rain | Bare soil, then mulch spread patch by patch |
| Plant flowers/shrubs | 2 h | 1/2 | plants, soil | freezing, heat | Holes dug, then plants placed one at a time |
| Build a flower bed | 4 h | 1/2 | edging stones/timbers, soil, plants | rain, freezing | Outline, dig, edging piece by piece, soil, plants |
| Overseed lawn | 2 h | 1/1 | seed, fertilizer, straw | rain, heat | Bare patches turn green over time |
| Lay sod | 4 h | 2/3 | sod rolls | freezing, heat | Dirt, then sod laid strip by strip |
| Stepping-stone path | 3 h | 1/2 | pavers/flagstone, sand | rain, freezing | Stones appear in sequence along a line |
| Fence section repair | 2 h | 1/2 | boards, nails | rain | Broken boards replaced one by one |

### Tier 3: Two or more people (can be done short-handed, slower)
| Job | Time | Crew (min/best) | Materials | Equipment | Weather |
|---|---|---|---|---|---|
| Paver patio | 12 h | 2/3 | pavers, gravel, sand | plate compactor (rent) | rain, freezing |
| Small retaining wall | 10 h | 2/3 | blocks, gravel, rebar | wheelbarrow, level | rain, freezing |
| Railroad-tie wall / raised bed | 8 h | 2/3 | ties, rebar | drill, saw | rain |
| Wood fence (per run) | 12 h | 2/3 | posts, boards, concrete | post-hole auger | rain, freezing |
| Sprinkler install | 10 h | 2/3 | pipe, heads | trencher (rent) | rain, freezing |
| Deck repair / small deck | 16 h | 2/3 | lumber, hardware | saws | rain |
| Tree trimming / small removal | 6 h | 2/3 | none | chainsaw (rent), chipper | wind, rain |
| Gravel driveway repair | 6 h | 2/3 | gravel | truck, rake | rain |
| Plow driveways/lots | per stop | 1/1 | fuel | plow truck | needs snow |

### Tier 4: Equipment jobs (rented first, owned later)
- Yard grading/leveling (skid steer or mini-bulldozer)
- Pond or drainage ditch (mini-excavator)
- Stump grinding (stump grinder)
- Large tree removal (chainsaw, chipper, bucket truck or extra crew)
- Gravel driveway install (loader, dump truck)
- Concrete pad or sidewalk (forms, rebar, mixer or delivery)

### Tier 5: Contracts and insurance territory
- Baseball field (grading, infield mix, sod, bases, fencing, backstop)
- Parking lot / paving prep
- Foundation or slab for a small building
- Commercial landscaping contracts (recurring, for example "mow the park weekly")
- Farm work (fence lines, field clearing, drainage, barn pad)
- **Snow: street plowing and salting** for the town (salt/plow truck contract)

---

*Last updated: full cleanup pass (reorganized into 14 sections), warehouse added.*
