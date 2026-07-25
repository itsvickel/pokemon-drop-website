import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: "/pokemon/sealed", permanent: false },
});

export default function IndexPage() {
  return null;
}
