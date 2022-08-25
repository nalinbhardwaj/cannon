package main

import (
	"bufio"
	"bytes"
	"fmt"
	"strconv"
)

// Model is a type which represents a word2vec Model and implements the Coser
// and Mapper interfaces.
type Model struct {
	dim   int
	words map[string]Vector
}


func loadWord2Vec(b []byte) (*Model, error) {
	r := bytes.NewReader(b)
	br := bufio.NewReader(r)
	var size, dim int
	n, err := fmt.Fscanln(r, &size, &dim)
	if err != nil {
		return nil, err
	}
	if n != 2 {
		return nil, fmt.Errorf("could not extract size/dim from binary model data")
	}

	m := &Model{
		words: make(map[string]Vector, size),
		dim:   dim,
	}

	fmt.Println(size, dim)

	for i := 0; i < size; i++ {
		w, err := br.ReadString(' ')
		if err != nil {
			return nil, err
		}
		w = w[:len(w)-1]

		raw := make([]float64, dim)
		for j := 0; j < dim; j++ {
			delim := ' '
			if j == dim-1 {
				delim = '\n'
			}
			d, err := br.ReadString(byte(delim))
			if err != nil {
				return nil, err
			}
			value, err := strconv.ParseFloat(d[:len(d)-1], 64)
			if err != nil {
					return nil, err
			}
			raw[j] = value
		}

		v := Vector(raw)
		v.Normalise()

		m.words[w] = v
	}
	return m, nil
}
