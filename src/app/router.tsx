/** The app's route tree: Home/Profiles/Settings nested under the root shell, plus a catch-all 404. */

import { createBrowserRouter, RouterProvider } from "react-router";

const createAppRouter = () =>
  createBrowserRouter([
    {
      path: "/",
      lazy: () => import("@/app/routes/root"),
      children: [
        { index: true, lazy: () => import("@/app/routes/home") },
        { path: "profiles", lazy: () => import("@/app/routes/profiles") },
        { path: "settings", lazy: () => import("@/app/routes/settings") },
      ],
    },
    {
      path: "*",
      lazy: () => import("@/app/routes/not-found"),
    },
  ]);

/** Renders the route tree described in the file header. */
export default function AppRouter() {
  return <RouterProvider router={createAppRouter()} />;
}
