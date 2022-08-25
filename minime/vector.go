package main

import "math"

type Vector []float64

// Normalise normalises the vector in-place.
func (v Vector) Normalise() {
	n := v.Norm()
	for i := range v {
		v[i] /= n
	}
}

// Norm computes the Euclidean norm of the vector.
func (v Vector) Norm() float64 {
	var out float64
	for _, vx := range v {
		out += vx * vx
	}
	return math.Sqrt(out)
}

// Add performs v += a * u (in-place).
func (v Vector) Add(a float64, u Vector) {
	for i := range v {
		v[i] += a * u[i]
	}
}

// Dot computes the dot product with u.
func (v Vector) Dot(u Vector) float64 {
	var out float64
	for i, vx := range v {
		out += vx * u[i]
	}
	return out
}