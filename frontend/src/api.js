import axios from 'axios'

const BASE_URL = 'https://pokeapi.co/api/v2/pokemon/'

const api = axios.create({
    baseURL: BASE_URL,
})
