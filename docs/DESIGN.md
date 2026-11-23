# Construction Sim: Design Document

> Living document. Updated as the roundtable talks continue.
> Status legend: **[LOCKED]** decided by the owner, **[PROPOSED]** suggested, awaiting a decision, **[OPEN]** unanswered question.

---

## 1. Vision

A top-down 2D landscaping/construction business sim, played in the browser and hosted on GitHub Pages. The player runs a small crew company in a small town. They accept jobs, schedule crews, drive trucks to real addresses, buy materials, and watch the work get built piece by piece on the map. Work starts simple (mowing) and grows into landscaping, hardscaping, and eventually full construction with heavy equipment.

**Tone:** cozy but with real business tension. Every job should raise the question "is this actually worth it?"

## 2. Technical Constraints

- **[LOCKED]** Hosted on GitHub Pages (static files only, deployed via GitHub Actions).
- **[LOCKED]** Top-down 2D.
- **[LOCKED]** Persistence via browser storage (localStorage and/or IndexedDB). No server.
- **[PROPOSED]** Plain HTML/CSS/JS with Canvas, no framework required. Revisit before coding.
- **[PROPOSED]** Three strictly separated layers:
  1. **Simulation:** clock, calendar, crews, jobs, money, weather. Numbers only, no drawing.
  2. **World:** map, streets, addresses, road graph.
  3. **Presentation:** truck animation, staged work visuals, UI. It only plays back what the simulation decided.
- **[PROPOSED]** All content (job types, materials, crew names, map lots, equipment) lives in data files, so new content never needs engine changes.
- **[PROPOSED]** Save data is versioned so old saves can migrate as the game changes.
- **[LOCKED]** Customization is a goal: make as much as possible configurable (hours, names, settings, and so on).
- **[LOCKED]** **Art/performance:** simple, lightweight visuals. Flat, clean 2D shapes and sprites. No realism and nothing heavy on the GPU. Some lag is acceptable, but the game should run well on mobile.
- **[LOCKED]** A **config file** holds tunable values. First entry: `secondsPerGameHour` (real seconds per in-game hour), **default and minimum 60**. Higher values are allowed and slow the game down.

## 3. The Map

- **[LOCKED]** Small-scale visuals, but a map large enough to matter.
- **[LOCKED]** Minimum areas:
  - 2 residential neighborhoods
  - A business area
  - Downtown
  - Farm areas
  - The player's property
- **[LOCKED]** Real street names and real addresses. Every job goes to an actual address on the map.
- **[LOCKED]** Supply locations are real places the crew can drive to, such as a lumber yard and a stone/landscape supply yard.
- **[LOCKED]** The map includes a **baseball field** as a landscaping job site (a flagship late-early-game job: infield dirt, grass, bases, fencing).
- **[LOCKED]** **Street naming:** plain, familiar, "every town has one" names (Main St., Prospect, State, Market, Exchange, Oakwood, and so on), plus numbered parallel streets (1st, 2nd, 3rd...). No silly or hard-to-remember names. Street names **never change**, so players learn the town over time.
- **[PROPOSED]** Target roughly 100-150 addressable lots at launch.
- **[PROPOSED]** The map is hand-designed but stored as data (grid/tiles plus a road graph), so it can expand later.
- **[PROPOSED]** Trucks pathfind along the road graph. Drive time is derived from route distance and truck speed.

## 4. Player Property

- **[LOCKED]** Starts small, with room to expand.
- **[LOCKED]** Starts large enough to house **4 crew members, including the player**.
- **[LOCKED]** Has an on-site **fuel pump** with a reservoir (see Fuel).
- **[PROPOSED]** Expansion hooks: garage bays, storage/material yard, office, bigger fuel tank.
- **[LOCKED]** The **full property, including all future expansion space, exists on the map from the start**. The undeveloped part is trees and open ground. Trees act as camouflage for space we haven't planned yet.
- **[LOCKED]** The property is **deliberately oversized**, so there's room for expansions nobody has thought of yet. Design the map with room to spare, not a tight fit.
- **[LOCKED]** The map supports **zooming in and out** (a given for the whole game).
- **[LOCKED]** **Service points:** the property and each store/location has **designated spots** where vehicles go to do their business (garage, fuel pump, parking at the property; loading spot at the lumber yard and stone yard). Arrive, the materials appear in the truck, drive off. No manual loading minigame.
- **[PROPOSED]** Clearing trees or land on the player's own property could be an in-game job.
- **[LOCKED]** **Crew commute:** crew do **not** live on the property. Their cars **fade in at the property driveway** at clock-in and **fade out** at clock-out. They don't drive on the town roads, so no employee home addresses are needed. (An optional cosmetic home address on a crew card is allowed later.)
- **[LOCKED]** **Parking capacity is the crew cap.** More parking is the "more crew" expansion.
- **[PROPOSED]** **Expansion list** (reserve the space on the map now, design each when we get to it):
  - *Day one:* small crew house/office space, fuel pump and tank, small garage or carport, parking spot, small tool shed
  - *Early:* bigger garage with more bays, bulk material yard (mulch, gravel, stone), office, bigger fuel tank, more crew parking
  - *Mid:* equipment barn/shed, heavy equipment parking, mechanic bay, tool/supply room, dump trailer parking, material bunkers
  - *Late:* large industrial equipment yard, **tree/plant nursery**, **gravel pit or sand quarry**, salt shed, plow truck fleet, business office building (HR/insurance)
  - *Flavor:* pond, fire pit, break lawn, flagpole, company sign by the road
- **[PROPOSED]** The starting developed area is about **a quarter** of the lot. The rest is trees and open ground.
- **[LOCKED]** **Nursery and gravel pit** are in as late-game expansions (the player eventually makes their own materials).

## 5. Time, Calendar and Hours

- **[LOCKED]** The player sets business hours. **Default: 7:00 AM to 5:00 PM, Monday to Friday.**
- **[LOCKED]** Days run in game-time with a pace/fast-forward control.
- **[LOCKED]** **Normal pace: 1 real minute = 1 in-game hour** (so a 10-hour shift takes about 10 real minutes). Configurable via `secondsPerGameHour`, with 60 as both the default and the minimum.
- **[LOCKED]** **After-hours skip:** when nobody is working, the player can skip ahead. It is **always manual**, available at the end of the shift only, because the player may want to do things (hire, buy, configure) before the next day starts. Nothing auto-advances past end of shift.
- **[LOCKED]** The calendar shows jobs and who is working on each day.
- **[PROPOSED]** The calendar shows the weather forecast.

## 6. Crew

### 6.1 Roster
- **[LOCKED]** A **Crew** section lets the player view the crew and hire new members.
- **[LOCKED]** Starting hires are low-skill and cheap. Example: **$12/hour**. Better workers cost more.
- **[LOCKED]** Better crew means better work quality, which means better results on jobs.
- **[PROPOSED]** Each crew member has: name, skill (overall, and later per job category), wage, schedule, employment type, and optional traits.

### 6.2 The Player ("Myself")
- **[LOCKED]** The player is a crew member and can be scheduled like anyone else.
- **[LOCKED]** The player has a wide array of capabilities (owner-level skill) but can still only do **one person's worth of work**.
- **[LOCKED]** The player is **not paid hourly**. They are the owner, and their income is **whatever profit remains** from jobs. The player has to schedule jobs so the company earns enough to cover their own "salary." Pay depends on the work done, not on showing up.
- **[OPEN]** How is the owner's take defined? Options: (a) free withdrawals from the company bank, (b) a draw the player sets, (c) a running profit tally. See open questions.

### 6.3 Employment and Schedules
- **[LOCKED]** Every crew member (including the player) can be scheduled for certain days and hours.
- **[LOCKED]** **Full-time:** works the full business day. The player only chooses their **days**.
- **[LOCKED]** **Part-time:** the player chooses both **days and hours**.
- **[LOCKED]** Employees are paid **hourly from clock-in to clock-out**, not per job. This includes drive time and idle time on the clock.

### 6.4 Crew Teams
- **[LOCKED]** Crew members are assigned to teams, named **"Crew (n)"** by default and renamable.
- **[LOCKED]** Some jobs require 2 or more people. They can be done with fewer, but take **mathematically more time**.
- **[PROPOSED]** Understaffed efficiency is not a straight multiple. For example, a 2-person job done by 1 person takes about 1.6-1.8x as long, because some of the work parallelizes and some doesn't. To be tuned.
- **[PROPOSED]** A team can only be dispatched with members who are on shift at that time.

## 7. Vehicles and Equipment

- **[LOCKED]** The player starts with a **slow half-ton truck that seats 2**.
- **[LOCKED]** Single-person jobs (mowing, raking, cleaning, hauling junk, and so on) can be done by one person.
- **[PROPOSED]** A crew larger than a vehicle's seats needs additional vehicles, which gives the player a reason to upgrade.
- **[LOCKED]** **Tools can be rented** (chainsaw, small bulldozer, front loader, and so on), scaling up to **renting or owning large industrial equipment much later in the game**.
- **[LOCKED]** Some job offers require equipment or crew the player doesn't have. They show up on the board but can't be accepted yet, which shows what to work toward.
- **[PROPOSED]** Rented equipment has a daily rate and has to be picked up and returned, ideally as a real map errand.

## 8. Fuel

- **[LOCKED]** The property has a **fuel pump with a reservoir**, which **starts full**.
- **[LOCKED]** There is **one fuel type**. Everything that burns fuel uses the same liquid. No gasoline/diesel distinction.
- **[LOCKED]** **Price is a flat $3.00 per gallon.**
- **[LOCKED]** Fuel is **ordered**, and delivery takes **one business day**. **Nothing is delivered on weekends**, so anyone working Saturday or Sunday has to watch their fuel and order ahead.
- **[PROPOSED]** Reservoir capacity: **500 gallons** at the start. Real farm and small-business tanks are commonly 250-1,000 gallons. Upgradeable later. **[OPEN to confirm]**
- **[PROPOSED]** The truck burns fuel by distance driven (starting around 14-16 mpg for a slow half-ton). Equipment burns fuel per hour of use.
- **[PROPOSED]** A truck also has its own tank, refilled from the property pump. Running a truck dry strands the crew.
- **[OPEN]** Whether to add public gas stations as an emergency option at a higher price.

## 9. Jobs

### 9.1 Job Offers
- **[LOCKED]** Jobs come from a **daily list of offers** that appear each day, similar to a gacha-style draw.
  - Mostly easy jobs the player can do now.
  - Some jobs that need more crew, tools or skill than the player has.
- **[PROPOSED]** The offer pool is weighted by job type, company reputation, and progression.
- **[PROPOSED]** Offers expire if not accepted.

### 9.1b Reputation and Business Growth
- **[LOCKED]** The company has a **reputation that improves as the player levels up**. Reputation affects which job offers appear.
- **[LOCKED]** Business milestones unlock over time:
  - **Insurance** (needed for bigger or riskier jobs)
  - **HR** (supports a larger roster)
  - **Contracts** (larger, recurring or multi-day work)
- **[PROPOSED]** Higher reputation unlocks better-paying clients and bigger jobs. Poor ratings lower it.
- **[OPEN]** Exact level thresholds and what each milestone costs and unlocks.

### 9.2 Job Definition (data-driven)
Each job type defines:
- Name and category
- Minimum and recommended crew size
- Base work time (for one average worker)
- Required equipment and materials
- Weather sensitivity
- Pay range and expected quality rating
- A **staged visual build sequence** (see 9.5)

### 9.3 Cost and Profit Model
When viewing an offer, the player sees **offered pay against estimated cost**:
- Labor (hourly wages for all on-the-clock time, including driving)
- Fuel
- Materials (grass seed, mulch, rocks, railroad ties, rebar, and so on)
- Equipment rental
- **[LOCKED]** The player is expected to reject bad jobs. Profitability judgment is core gameplay.

### 9.4 Scheduling Rules
- **[LOCKED]** Accepted jobs are **scheduled automatically** into a day and time block.
- **[LOCKED]** Each block is built from the job's **average completion time, plus extra padding** so jobs are not crammed in where they might not finish.
- **[LOCKED]** The block must also include **travel time** and any **other required stops** (such as picking up materials).
- **[PROPOSED]** Block length = (base work time ÷ crew efficiency) + drive time + load/setup time + buffer (about 15-25 percent, larger in bad weather).
- **[PROPOSED]** The scheduler finds the first slot where a suitable crew is free and the block fits inside working hours.

### 9.5 Visual Build Sequence
- **[LOCKED]** Work is **displayed on the map**. Pieces appear a little at a time as the job progresses.
- **[LOCKED]** Visuals look a bit "half-assed" in progress, then turn out finished. Example: a flower bed goes from marked out, to dug, to edging placed piece by piece, to soil, to plants.
- **[PROPOSED]** Visual progress is tied to simulated job progress. Crew skill affects the final look (crooked edging for sloppy crews).
- **[LOCKED]** The list of job types will be worked out together in the roundtable and must each be representable on the map.

### 9.6 Overruns and Ratings
- **[LOCKED]** If a job isn't finished in its block, it **must be finished the next morning**.
- **[LOCKED]** An overrun **lowers the job rating, which lowers pay.**
- **[LOCKED]** Each job has an expected rating, and quality matters more the better the crew should be.
- **[PROPOSED]** Rating inputs: crew skill, on-time completion, weather, and whether the job was understaffed.

## 10. Weather

- **[LOCKED]** Rain, snow, wind and so on happen occasionally.
- **[LOCKED]** Weather **hinders certain jobs and makes them take longer.**
- **[PROPOSED]** Each job type has weather sensitivities. Weather either multiplies the time or blocks the job entirely, which bumps it to the next workable day.
- **[PROPOSED]** A simple forecast (1-3 days out) so the player can plan.

## 11. Economy Summary

| Money in | Money out |
|---|---|
| Job payments (modified by rating) | Hourly crew wages (clock-in to clock-out) |
| | Fuel ($3/gal) |
| | Materials |
| | Equipment rental / purchase |
| | Property upgrades |

The player (as owner) is paid from what remains. See open questions.

### 11.1 Debt, Loans and Losing
- **[LOCKED]** The player **can lose**. Going into the red starts a countdown (see below).
- **[LOCKED]** The player can **borrow from the bank at interest**. Interest is kept reasonable, not crazy.
- **[LOCKED]** Per the owner, modeled on real life: **small loans cost more, big loans cost less.** Big lenders won't touch small amounts for new borrowers, predatory lenders happily will, and large loans have lower rates because of longer terms and a qualified borrower.
- **[PROPOSED]** Three loan types:
  | Loan | Amount | Cost | Catch |
  |---|---|---|---|
  | **Cash advance** (the loan shark) | ~$100-$1,000 | Flat fee, ~$20-25 per $100 | Short term (a few days). Anyone qualifies, including a struggling new company. |
  | **Small bank loan** | ~$1,000-$5,000 | Moderate interest | Needs some reputation. |
  | **Business loan** | ~$10,000+ | Lowest interest, long term | Needs strong reputation (and later insurance, contracts). |
- **[PROPOSED]** Qualification for better loans is tied to **reputation** (see 9.1b), so growing the business gets the player cheaper money.
- **[PROPOSED]** Failure condition: if the balance stays negative for a set number of days, the business fails (game over). The grace period is shown clearly in the UI.
- **[OPEN]** Grace period length, loan tiers and rates, repayment rules, and whether bankruptcy ends the save or allows a restart with a penalty.

## 12. Persistence

- **[LOCKED]** Saves live in the browser via local storage and/or a local DB (IndexedDB).
- **[PROPOSED]** Autosave at end of day, plus manual save and export/import of save files so players don't lose progress if browser data is cleared.

## 13. Milestones (Proposed Build Order)

Nothing gets coded until the design settles. When it does, build in small, playable slices:

1. **Map and truck:** one road, a few lots, a truck driving between addresses.
2. **Clock and calendar:** day/hour flow, business hours, manual end-of-day skip.
3. **First job:** one mowing job end to end, with staged visuals and pay.
4. **Money and costs:** wages, fuel, pump and reservoir, job profit screen.
5. **Crew:** hiring, schedules, teams, ratings.
6. **Job board:** daily offers, more job types, materials and supply yards.
7. **Weather and overruns.**
8. **Equipment rental and expansion.**
9. **Full map, polish, saves.**

## 14. Open Questions

1. **Owner pay:** free withdrawals, a player-set draw, or just a profit tally?
2. **Fuel tank size:** is 500 gallons okay as the start?
3. **Public gas stations:** include as an emergency option, or not?
4. **Loans and bankruptcy details:** grace period, exact loan amounts, rates and terms for the three loan types, what happens on game over.
5. **Reputation and milestones:** level thresholds, and what insurance, HR and contracts each cost and unlock.
6. **Pay during idle time:** employees are paid while clocked in. If no job is scheduled for them, are they still paid? (Probably yes, which punishes under-booking.)
7. **Job type list:** to be brainstormed together (mowing, raking, hauling, mulching, flower beds, fencing, retaining walls, patios, baseball field, and beyond).
8. **Map layout and street names:** to be designed together.

### Resolved
- Failure states: yes, the player can lose (see 11.1).
- Day length: 60 real seconds per game hour, configurable (see 5).
- Art style: simple, lightweight, mobile-friendly (see 2).
- Reputation exists and grows with level (see 9.1b).

---

## 18. Traffic and Map Scale

### 18.1 Abstract map scale
- **[LOCKED]** The map is **not** scaled to real-world distances. Truck speed (tiles per second) is tuned for **how it looks**, and drive time is derived from route length and speed.
- **[LOCKED]** Normal pace stays **60 real seconds per game hour**.
- **[PROPOSED]** Typical trips take **10-30 game minutes** (about 10-30 real seconds), and farm trips are longer (about 30-45 real seconds). Fast-forward is available for boring drives.
- **[PROPOSED]** Fuel is burned **per tile driven** (a "game mile" is a fixed number of tiles).

### 18.2 AI traffic
- **[LOCKED]** The town has **random AI traffic** alongside the player's trucks.
- **[LOCKED]** **Everyone obeys traffic laws**: speed limits, **stop signs, traffic lights**, right of way, and keeping distance from the car ahead. Vehicles do **not** drive through each other.
- **[LOCKED]** **Density:** downtown is busiest, residential is lighter, rural is lightest.
- **[LOCKED]** **Rush hour** brings heavier traffic toward downtown.
- **[LOCKED]** **AI cars appear and disappear at driveways and parking lots** (fade in, drive to a destination, park, fade out). No cars phasing through buildings.
- **[LOCKED]** Traffic **delays the player's trucks**. The truck may **reroute** if it gets stuck; otherwise it deals with it.
- **[PROPOSED]** The scheduler pads drive time to account for average traffic and rush hour.
- **[PROPOSED]** Performance: cap the number of active cars (about 15-30 on screen), and use cheaper handling for cars far from the camera. Must run on mobile.

### 18.3 Parking at job sites
- **[LOCKED]** The player's work vehicles **park on the street in front of the job site**.
- **[LOCKED]** If an AI car is parked in that spot, it **drives away before the player arrives**. Traffic keeps clear of the player's parking spot.
- **[PROPOSED]** AI cars are also parked on streets and in driveways as scenery, but never in a reserved job spot.

### 18.4 Later hindrances (after the foundation works)
- **[LOCKED]** **School bus:** one route, running in the morning rush, and again at school letting out (about 2-3 PM). Players can get stuck behind it.
- **[LOCKED]** **Railroad:** trains occasionally block crossings, long enough to be annoying (around 20 cars).
- **[LOCKED]** **No accidents** for now.
- **[PROPOSED]** Pedestrians and other extras are optional later.

## 19. Map Plan (Draft v2)

- **[LOCKED]** **Property location:** out in the **rural southwest**, far enough from town to have room to expand.
- **[LOCKED]** **Natural features:** a **creek or river with a bridge**, **ponds**, and a **railroad** through town.
- **[LOCKED]** **Civic buildings:** school, library, police station, fire station, hospital (just a larger building, not a whole district), and town hall.
- **[LOCKED]** **Neighborhood variety:** one neighborhood is a **more upper-middle-class area with curves and cul-de-sacs**. Layout freedom (including a diagonal road here or there) goes to the designer, as long as roads and traffic work.
- **[PROPOSED]** Layout: named streets run east-west (Oakwood, Prospect, Main, Market, Exchange, State), numbered Avenues run north-south (1st-6th). A railroad runs east-west between Market and Exchange, crossing at 2nd, 4th and 6th Ave. A creek runs along the west side with a bridge on State St. Neighborhood A (grid, working class) is in the northwest, Neighborhood B (curvy, upper middle) in the northeast, park/ballfield in the middle, downtown in the center, the business area (lumber yard, stone yard, hardware, fuel depot) south of the tracks, and farms around the edges. Cemetery by the north farmland. Hospital on the east side.

## 15. Recurring Customers

- **[LOCKED]** Some jobs (especially **mowing**) can be **recurring customers**, for example "mow every week."
- **[LOCKED]** The **player can cancel** a recurring customer, for instance when bigger jobs need the time slot.
- **[LOCKED]** **Customers can cancel on their own**, like real life.
- **[PROPOSED]** Recurring jobs are auto-placed in the calendar like any accepted job. They are stable income, but they fill the schedule.
- **[PROPOSED]** Reasons a customer might cancel: repeated low ratings, missed or late visits, moving away, or random churn. Cancelling a customer on them has a small reputation cost.
- **[OPEN]** Notice periods, whether the player can raise prices on recurring customers, and how many can be active at once.

## 16. Seasons and Snow

- **[LOCKED]** The game has **seasons**, including **winter with snow work**.
- **[LOCKED]** Snow work **starts small and grows**:
  1. Shovel walks and driveways (solo, basic tools)
  2. Plow truck (blade on a truck) for driveways and lots
  3. Larger plow truck
  4. **Salt/plow truck** for **streets**
- **[PROPOSED]** Seasonal swing: fall = leaf cleanup rush, winter = snow work and slow landscaping, spring = mulch/planting/cleanup rush, summer = mowing peak and storm cleanup. Players who don't plan for winter income will be paying idle crews.

## 17. Job Catalog (Draft, rough numbers for tuning)

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

### Job catalog open questions
- Real base times and prices for each job (needs a balancing pass once the game exists).
- Which jobs need insurance, and which need contracts.
- More jobs to add. (Owner has many ideas still to share.)

## 20. Crew Stats, Hiring and Raises

### 20.1 Stats and leveling
- **[LOCKED]** Crew have an **overall level** plus individual stats, each rated **1-10**.
- **[LOCKED]** Starting stats: **Speed** and **Quality** (the two main ones), plus more.
- **[PROPOSED]** Full stat list: **Speed** (work pace), **Quality** (job rating, neatness), **Stamina** (holds pace over a long day), **Driving** (fuel economy, time lost in traffic), **Equipment** (needed to operate machines, gates Tier 4 jobs), **Teamwork** (boosts the whole crew's efficiency).
- **[LOCKED]** With six stats, **more than one point per level** is allowed, and milestones can award points too.
- **[LOCKED]** Stats can also be raised by **paying for training**, and **training cost rises as the stat gets higher**.
- **[LOCKED]** Crew **earn XP while working**. Level-ups give points the player can spend on any stat (max 10), by clicking on the crew member.
- **[PROPOSED]** **2 points per level**, plus a **bonus point at milestone levels** (5, 10, 15, and so on). All numbers are tunable.
- **[PROPOSED]** Training is an instant, paid stat increase of +1. The cost scales with the stat's current value (cheap at low values, expensive near 10).
- **[LOCKED]** A crew member's points can be **reset to their original stats and re-spent for a price**.
- **[PROPOSED]** Respec price scales with level.
- **[PROPOSED]** Hidden **Morale** stat drives raise requests and quitting.

### 20.2 Hiring pool
- **[LOCKED]** Hiring works like the job board: a **daily pool of applicants**, gacha-style.
- **[LOCKED]** Very good applicants **sometimes appear that the player can't afford yet**, as something to look forward to. The pool **always includes common and uncommon applicants** the player can actually hire.
- **[PROPOSED]** Rarity tiers (common, uncommon, rare, and so on). Higher **reputation** shifts the odds toward better applicants.
- **[LOCKED]** Each applicant has an **asking starting wage**. The starting low end is **$12/hour**.
- **[LOCKED]** The player can **offer a different wage**, and the applicant **accepts or declines**. Offering **more than asked guarantees acceptance**.
- **[PROPOSED]** Offering **less** than asked may be declined, with the chance depending on how far below. Applicants may leave the pool at the end of the day.
- **[PROPOSED]** Wage range: **$12/hour** at the bottom up to roughly **$40-60/hour** for the rarest applicants. Tunable.

### 20.3 Raises, quitting and insurance
- **[LOCKED]** Crew can **ask for raises** (or get automatic raises as they progress), and can **quit**, **giving notice first**.
- **[LOCKED]** **Raise requests** (the request-and-decide system): when a worker levels up or hits a milestone, they ask for a raise. The player accepts or declines. Declining lowers morale.
- **[PROPOSED]** Low morale leads to **notice of quitting** (for example a 2-day notice). The player can keep them by improving pay or conditions.
- **[LOCKED]** **Insurance** is a **per-day premium paid alongside payroll**, a later-game option. Workers may eventually want to be insured.
- **[PROPOSED]** Insurance improves morale. Unlocked with the HR milestone (see 9.1b).

## 21. Money Format

- **[LOCKED]** **All money is whole dollars (integers).** No cents anywhere.
- **[LOCKED]** The **HUD shows short form** (for example **$1.54M**). The **money screen shows the full amount** with commas (for example **$1,540,391**).
- **[PROPOSED]** Wages, fuel and other fractional amounts are **calculated and rounded to the nearest whole dollar when paid**, never mid-job.
- **[PROPOSED]** Standard JavaScript numbers are sufficient (they hold integers safely to about 9 quadrillion).

---

*Last updated: crew stats, hiring, raises and money format.*
