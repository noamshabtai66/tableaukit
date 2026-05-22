import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) {
    return redirect("/signin");
  }

  const formData = await request.formData();
  const templateSlug = (formData.get("template_slug") ?? "").toString().trim();
  const action = (formData.get("action") ?? "").toString();

  if (!templateSlug) {
    return new Response("Missing template_slug", { status: 400 });
  }

  if (action === "add") {
    await locals.supabase
      .from("tk_favorites")
      .upsert(
        { user_id: locals.user.id, template_slug: templateSlug },
        { onConflict: "user_id,template_slug" },
      );
  } else if (action === "remove") {
    await locals.supabase
      .from("tk_favorites")
      .delete()
      .eq("user_id", locals.user.id)
      .eq("template_slug", templateSlug);
  } else {
    return new Response("Invalid action", { status: 400 });
  }

  const referer = request.headers.get("referer");
  return redirect(referer ?? `/templates/${templateSlug}`);
};
