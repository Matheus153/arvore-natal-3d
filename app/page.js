import ChristmasScene from "@/components/ChristmasScene";

export default function Home() {
  return (
    <main>
      <div className="overlay">
        <h1>Feliz Natal!</h1>
        <p>e um próspero Ano Novo 🎄</p>
      </div>

      <ChristmasScene />

      <div className="hint">Arraste para girar · role para aproximar</div>
    </main>
  );
}
