// Keplerian circular velocity; GM is passed as uniform
uniform float GM;

float angularVel(float r) {
    return sqrt(GM / pow(r, 3.0));
}
