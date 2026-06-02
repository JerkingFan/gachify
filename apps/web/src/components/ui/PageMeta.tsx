import { Helmet } from "react-helmet-async";

type PageMetaProps = {
  title: string;
  description?: string;
  url?: string;
  image?: string;
  oembedUrl?: string;
};

export function PageMeta({ title, description, url, image, oembedUrl }: PageMetaProps) {
  const fullTitle = title.includes("Gachify") ? title : `${title} · Gachify`;
  const desc = description ?? "Deep Dark Fantasy, delivered at scale.";
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      {oembedUrl && (
        <link rel="alternate" type="application/json+oembed" href={oembedUrl} title="Gachify oEmbed" />
      )}
      <meta property="og:type" content="website" />
    </Helmet>
  );
}
