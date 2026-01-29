import moment from 'moment';

// Constants for the simulation
const DISTANCE_TO_TRAVEL = 1.5; // Distance in kilometers
const INITIAL_SPEEDS = {
    North: 60,
    South: 60,
    East: 50,
    West: 50
};

// Default densities (vehicles per km) for each direction
const DENSITIES = {
    North: 20,
    South: 20,
    East: 15,
    West: 15
};

// Factors that influence speed prediction
const TIME_FACTORS = {
    MORNING_RUSH: { start: 7, end: 9, factor: 0.7 },  // 70% of max speed during morning rush
    EVENING_RUSH: { start: 16, end: 18, factor: 0.6 }, // 60% of max speed during evening rush
    NIGHT: { start: 22, end: 5, factor: 0.9 },        // 90% of max speed at night
    NORMAL: { factor: 0.8 }                           // 80% of max speed during normal hours
};

// Random variation to make predictions more realistic
const getRandomVariation = (baseSpeed) => {
    const variation = Math.random() * 10 - 5; // Random number between -5 and 5
    return Math.max(0, baseSpeed + variation);
};

// Get time-based factor for speed calculation
const getTimeFactor = () => {
    const currentHour = moment().hour();

    if (currentHour >= TIME_FACTORS.MORNING_RUSH.start && currentHour <= TIME_FACTORS.MORNING_RUSH.end) {
        return TIME_FACTORS.MORNING_RUSH.factor;
    }
    if (currentHour >= TIME_FACTORS.EVENING_RUSH.start && currentHour <= TIME_FACTORS.EVENING_RUSH.end) {
        return TIME_FACTORS.EVENING_RUSH.factor;
    }
    if (currentHour >= TIME_FACTORS.NIGHT.start || currentHour <= TIME_FACTORS.NIGHT.end) {
        return TIME_FACTORS.NIGHT.factor;
    }
    return TIME_FACTORS.NORMAL.factor;
};

// Direction-specific factors (some directions might be busier than others)
const DIRECTION_FACTORS = {
    North: 1.0,
    South: 0.9,
    East: 1.1,
    West: 0.95
};

class VehicleGroup {
    constructor(direction, isSecondGroup = false) {
        this.direction = direction;
        this.isSecondGroup = isSecondGroup;
        this.distanceTraveled = 0;
        this.hasReached = false;
        this.speed = isSecondGroup ? INITIAL_SPEEDS[direction] / 2 : INITIAL_SPEEDS[direction];
        this.timeElapsed = 0;
        this.maxSpeed = INITIAL_SPEEDS[direction];
        this.volume = 0; // vehicles in this group (will be set by simulation)
    }

    updateSpeed() {
        const timeFactor = getTimeFactor();
        const directionFactor = DIRECTION_FACTORS[this.direction];

        // Base speed calculation using original prediction logic
        let baseSpeed = this.maxSpeed * timeFactor * directionFactor;

        // Apply density effect: higher road density reduces achievable speed.
        // density is vehicles per km; normalize against a heavy threshold (50 veh/km)
        const density = Math.max(0, DENSITIES[this.direction] || 0);
        const densityNormalized = density / 50; // 1.0 ~ very heavy
        const densityAdjustment = Math.max(0.4, 1 - densityNormalized); // clamp at 40%
        baseSpeed = baseSpeed * densityAdjustment;

        // Volume effect: larger group volumes slightly reduce speed (up to 40%)
        const vol = this.volume || 0;
        const volAdjustment = 1 - Math.min(0.4, vol / 100); // vol/100 caps impact
        baseSpeed = baseSpeed * volAdjustment;

        // Adjust for second group
        if (this.isSecondGroup && !this.hasReached) {
            baseSpeed = baseSpeed / 2;
        }

        // Add random variation
        this.speed = Math.min(Math.round(getRandomVariation(baseSpeed)), this.maxSpeed);

        if (this.hasReached && this.isSecondGroup) {
            this.speed = Math.min(this.speed * 2, this.maxSpeed);
        }
    }

    update(deltaTime) {
        if (this.hasReached && !this.isSecondGroup) return;

        this.updateSpeed();
        this.timeElapsed += deltaTime;

        // Convert speed from km/h to km/s for calculation
        const speedInKmPerSecond = this.speed / 3600;
        this.distanceTraveled += speedInKmPerSecond * deltaTime;

        if (this.distanceTraveled >= DISTANCE_TO_TRAVEL) {
            this.hasReached = true;
        }
    }

    getStatus() {
        return {
            direction: this.direction,
            currentSpeed: this.speed,
            volume: this.volume,
            distanceTraveled: Number(this.distanceTraveled.toFixed(3)),
            timeElapsed: Number(this.timeElapsed.toFixed(1)),
            hasReached: this.hasReached,
            estimatedTimeToReach: this.hasReached ?
                this.timeElapsed :
                Number(((DISTANCE_TO_TRAVEL - this.distanceTraveled) / (this.speed / 3600)).toFixed(1))
        };
    }
}

class TrafficSimulation {
    constructor() {
        this.firstGroups = {};
        this.secondGroups = {};

        this.groupVolumes = {}; // store volumes per direction

        ['North', 'South', 'East', 'West'].forEach(direction => {
            this.firstGroups[direction] = new VehicleGroup(direction, false);
            this.secondGroups[direction] = new VehicleGroup(direction, true);
        });

        // initialize volumes based on densities
        this._recalculateVolumes();
    }

    // Recalculate volumes for each direction based on DENSITIES and DISTANCE_TO_TRAVEL
    _recalculateVolumes() {
        ['North', 'South', 'East', 'West'].forEach(direction => {
            const totalVehicles = Math.max(1, Math.round((DENSITIES[direction] || 0) * DISTANCE_TO_TRAVEL));
            // split: first group gets 60% (vehicles closer), second gets remainder
            const firstCount = Math.ceil(totalVehicles * 0.6);
            const secondCount = Math.max(0, totalVehicles - firstCount);
            this.groupVolumes[direction] = { total: totalVehicles, first: firstCount, second: secondCount };
            this.firstGroups[direction].volume = firstCount;
            this.secondGroups[direction].volume = secondCount;
        });
    }

    update(deltaTime) {
        // Recalculate volumes in case densities changed externally
        this._recalculateVolumes();
        Object.values(this.firstGroups).forEach(group => group.update(deltaTime));
        Object.values(this.secondGroups).forEach(group => group.update(deltaTime));
    }

    getStatus() {
        const status = {};
        ['North', 'South', 'East', 'West'].forEach(direction => {
            status[direction] = {
                firstGroup: this.firstGroups[direction].getStatus(),
                secondGroup: this.secondGroups[direction].getStatus(),
                maxSpeed: INITIAL_SPEEDS[direction]
            };
            // expose density and volume info
            status[direction].density = DENSITIES[direction] || 0;
            status[direction].volumes = this.groupVolumes[direction] || { total: 0, first: 0, second: 0 };
        });
        return status;
    }
}

// Create a single instance of the simulation
const simulation = new TrafficSimulation();

// Original speed prediction function
export const predictTrafficSpeed = (direction, maxSpeed) => {
    const timeFactor = getTimeFactor();
    const directionFactor = DIRECTION_FACTORS[direction];

    // Base speed calculation
    const baseSpeed = maxSpeed * timeFactor * directionFactor;

    // Add random variation
    const predictedSpeed = getRandomVariation(baseSpeed);

    // Ensure speed doesn't exceed max speed
    return Math.min(Math.round(predictedSpeed), maxSpeed);
};

// New function to get traffic status with groups
export const getTrafficStatus = () => {
    simulation.update(1);
    return simulation.getStatus();
};

// Allow external code to adjust density per direction
export const setDensity = (direction, densityValue) => {
    if (DENSITIES[direction] !== undefined) {
        DENSITIES[direction] = Math.max(0, Number(densityValue) || 0);
        return true;
    }
    return false;
};