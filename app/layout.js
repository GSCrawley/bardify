import "./globals.css";

export const metadata = {
  title: "Bardify — The Shakespearean Translator",
  description:
    "The Two-Tongued Quill: translate modern English to Shakespearean prose and back, forge skits in the Bard's tongue, fire genuine Shakespearean insults, and study Early Modern English — built from the vocabulary, grammar, and lines of Shakespeare's plays and sonnets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
