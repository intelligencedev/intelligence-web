
let starColorsRGBA = ['rgba(255, 255, 255, 1)', 'rgba(255, 255, 224, 1)', 'rgba(255, 255, 0, 1)', 'rgba(255, 165, 0, 1)', 'rgba(255, 140, 0, 1)'];

// this class describes the properties of a single particle.
class Particle {
    // setting the co-ordinates, radius and the
    // speed of a particle in both the co-ordinates axes.
    constructor() {
        this.x = random(width / 2, width / 2);
        this.y = random(height / 2, height / 2);
        this.r = random(1, 3);
        this.xSpeed = random(-2, 2);
        this.ySpeed = random(-1, 1.5);
        this.angle = random(0, 8 * PI); // added angle for elliptical orbit
        this.a = random(100, 150); // added semi-major axis for elliptical orbit
        this.b = random(100, 200); // added semi-minor axis for elliptical orbit

        this.color = random(starColorsRGBA); // added random color selection

    }

    // creation of a particle.
    createParticle() {
        noStroke();
        fill(this.color);
        circle(this.x, this.y, this.r);
    }

    // setting the particle in motion.
    moveParticle() {

        // moved the collision detection inside the moveParticle function
        if (this.x < 0 || this.x > width) {
            this.xSpeed *= -1;
        }
        if (this.y < 0 || this.y > height) {
            this.ySpeed *= -1;
        }

        // added code for elliptical orbit
        this.angle += 0.002; // adjust speed of orbit
        this.x = width / 2 + this.a * 4 * cos(this.angle * 2);
        this.y = height / 2 + this.b * sin(this.angle * 4);
    }

    // this function creates the connections(lines)
    // between particles which are less than a certain distance apart
    joinParticles(particles) {
        particles.forEach(element => {
            let dis = dist(this.x, this.y, element.x, element.y);
            if (dis < random(15, 45)) {
                stroke('rgba(255,255,255,0.2)');
                line(this.x, this.y, element.x, element.y);
            }
        });
    }
}

// an array to add multiple particles
let particles = [];

function setup() {
    createCanvas(window.innerWidth, window.innerHeight);
    for (let i = 0; i < 400; i++) {
        particles.push(new Particle());
    }
}

function draw() {
    background('#0f0f0f');
    let pcolor = random(starColorsRGBA);
    for (let i = 0; i < particles.length; i++) {
        particles[i].createParticle(pcolor);
        particles[i].moveParticle();
        particles[i].joinParticles(particles.slice(i));
    }
}
