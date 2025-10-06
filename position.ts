namespace position {

    class OccupancyGrid {

    }

    export function updateSensors() {
        //  Update Compass direction, current speed, deviation, commands coming from Bluetooth, ...
        //  TO DO Compute current position with sensor fusion https://github.com/micropython-IMU/micropython-fusion/tree/master
        let compass_heading = input.compassHeading()
        let mag_x = input.magneticForce(Dimension.X)
        let mag_y = input.magneticForce(Dimension.Y)
        let mag_z = input.magneticForce(Dimension.Z)
        let acc_x = input.acceleration(Dimension.X)
        let acc_y = input.acceleration(Dimension.Y)
        let acc_z = input.acceleration(Dimension.Z)
        let acceleration = Math.sqrt(acc_x ** 2 + acc_y ** 2 + acc_z ** 2)
    }

    export function updateEnvironment() {
        // re-compute the occupancy grid : QRCodes cardinals, home location, balls clusters, robots
        // approximate the Robot orientation and position
    }
}