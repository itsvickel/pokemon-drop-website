import type { GetServerSideProps } from "next";

// Old URL — preserve query so ?alert= deep links from emails keep working.
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const qIndex = ctx.resolvedUrl.indexOf("?");
  const qs = qIndex === -1 ? "" : ctx.resolvedUrl.slice(qIndex);
  return { redirect: { destination: `/pokemon/sealed${qs}`, permanent: false } };
};

export default function PokemonPage() {
  return null;
}
