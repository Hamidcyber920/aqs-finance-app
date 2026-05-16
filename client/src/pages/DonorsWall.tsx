/**
 * /donors-wall — Public Donors Wall (Spec Module 07)
 *
 * Displays donors who have opted in to public recognition.
 * Shows dedications (Sadaqah Jariyah) and top donors by lifetime giving.
 * No login required — public-facing page.
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Star, Award, Users } from "lucide-react";
import { useEffect } from "react";

const TIER_COLORS: Record<string, string> = {
  Platinum: "bg-purple-100 text-purple-800 border-purple-300",
  Gold: "bg-amber-100 text-amber-800 border-amber-300",
  Silver: "bg-gray-100 text-gray-700 border-gray-300",
  Bronze: "bg-orange-100 text-orange-800 border-orange-300",
};

export default function DonorsWall() {
  useEffect(() => {
  }, []);

  const { data: wallData, isLoading } = (trpc as any).crm.getDonorsWall.useQuery();

  const topDonors: any[] = wallData?.topDonors ?? [];
  const dedications: any[] = wallData?.dedications ?? [];
  const stats: any = wallData?.stats ?? {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900 text-white">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_70%)]" />
        <div className="relative max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <Heart className="w-8 h-8 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white">
            Our Donors Wall
          </h1>
          <p className="text-emerald-300 text-lg max-w-2xl mx-auto">
            In gratitude to all those who have given generously to the Abdullah Quilliam Society.
            May Allah accept your charity and reward you with Jannah.
          </p>
          <p className="text-emerald-400/70 text-sm mt-2 italic">
            بَارَكَ اللَّهُ فِيكُمْ — May Allah bless you all
          </p>

          {/* Stats row */}
          {stats.totalDonors > 0 && (
            <div className="flex flex-wrap justify-center gap-6 mt-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-300">{stats.totalDonors?.toLocaleString()}</p>
                <p className="text-xs text-emerald-400/70 uppercase tracking-wide mt-0.5">Generous Donors</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-300">£{Number(stats.totalRaised ?? 0).toLocaleString()}</p>
                <p className="text-xs text-emerald-400/70 uppercase tracking-wide mt-0.5">Total Raised</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-300">{stats.totalDedications?.toLocaleString()}</p>
                <p className="text-xs text-emerald-400/70 uppercase tracking-wide mt-0.5">Dedications</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-16 space-y-12">
        {/* Top Donors */}
        {topDonors.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Award className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Our Generous Supporters</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {topDonors.map((donor: any, idx: number) => (
                <Card key={donor.id} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors">
                  <CardContent className="p-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                      <span className="text-emerald-300 font-bold text-sm">
                        {(donor.displayName || donor.name || "A").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white truncate">{donor.displayName || donor.name}</p>
                    {donor.tier && (
                      <Badge className={`text-xs mt-1 ${TIER_COLORS[donor.tier] ?? "bg-emerald-100 text-emerald-800"}`}>
                        {donor.tier}
                      </Badge>
                    )}
                    {idx < 3 && (
                      <p className="text-xs text-amber-400 mt-1">
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"} #{idx + 1}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Sadaqah Jariyah Dedications */}
        {dedications.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Star className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white">Sadaqah Jariyah Dedications</h2>
              <p className="text-emerald-400/70 text-sm ml-2">Perpetual charity in memory of loved ones</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {dedications.map((entry: any) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 hover:bg-amber-500/10 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Star className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{entry.beneficiaryName}</p>
                      {entry.beneficiaryRelation && (
                        <p className="text-xs text-amber-300/70 mt-0.5">{entry.beneficiaryRelation}</p>
                      )}
                      {entry.beneficiaryNotes && (
                        <p className="text-xs text-emerald-300/60 mt-1 line-clamp-2">{entry.beneficiaryNotes}</p>
                      )}
                      <p className="text-xs text-white/30 mt-1.5">
                        {new Date(entry.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!isLoading && topDonors.length === 0 && dedications.length === 0 && (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-emerald-400/40 mx-auto mb-4" />
            <p className="text-emerald-300/60 text-lg">Our donors wall is being prepared.</p>
            <p className="text-emerald-400/40 text-sm mt-2">JazakAllah Khayran to all our supporters.</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-8 border-t border-white/10">
          <p className="text-emerald-400/50 text-sm">
            Abdullah Quilliam Society · Registered Charity No. 1089966
          </p>
          <p className="text-emerald-400/30 text-xs mt-1">
            To donate or to be listed on this wall, visit our{" "}
            <a href="/pay" className="underline hover:text-emerald-300">donation page</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
