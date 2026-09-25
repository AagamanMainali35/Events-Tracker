import { useEffect, useState } from 'react'
import { getPokemonList } from '../api'

function Home() {
  const [pokemon, setPokemon] = useState([])

  useEffect(() => {
    getPokemonList(5)
      .then((data) => {
        console.log('API response:', data)
        setPokemon(data.results)
      })
      .catch((err) => console.error(err))
  }, [])

  return (
    <div>
      <h1>This is home page</h1>
      <ul>
        {pokemon.map((p) => (
          <li key={p.name}>{p.name}</li>
        ))}
      </ul>
    </div>
  )
}

export default Home
