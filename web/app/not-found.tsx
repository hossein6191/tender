import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sheet pinned px-5 pt-7 pb-5">
      <p className="head text-[24px] font-bold">Nothing is pinned here.</p>
      <Link href="/" className="link mt-2 inline-block text-council">
        Back to the noticeboard
      </Link>
    </div>
  );
}
