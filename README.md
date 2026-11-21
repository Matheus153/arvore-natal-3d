# 🎄 Árvore de Natal 3D

Uma árvore de Natal interativa em 3D, feita com **Next.js** e **React Three Fiber** (Three.js).

- Pinheiro gerado proceduralmente com ramos curvados e agulhas desenhadas em textura
- Bolas metálicas com reflexo, estrela dourada lapidada com halo de brilho no topo e pisca-pisca de luz quente cintilando
- Chão de neve com relevo, textura granulada e cristais cintilando; neve caindo, céu estrelado, saia da árvore e presentes com laço
- Céu noturno em degradê com lua, bloom nas luzes, presentes com papel estampado e bolas com acabamentos variados
- Fita vermelha de cetim enrolada em espiral e dois fios de pisca-pisca
- Câmera interativa: arraste para girar e role para aproximar

## Tecnologias

- [Next.js](https://nextjs.org/) (App Router)
- [React Three Fiber](https://r3f.docs.pmnd.rs/) e [Drei](https://drei.docs.pmnd.rs/)
- [Three.js](https://threejs.org/) e [postprocessing](https://github.com/pmndrs/postprocessing)

## Rodando localmente

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Deploy na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe este repositório.
2. A Vercel detecta o Next.js automaticamente; não é preciso alterar nenhuma configuração.
3. Clique em **Deploy**.

## Estrutura

```
app/
  layout.js        # layout raiz e metadados
  page.js          # página com o título e a cena
  globals.css      # estilos globais
components/
  ChristmasScene.jsx  # toda a cena 3D
```
