import { createBrowserRouter, RouterProvider } from "react-router";

const createAppRouter = () =>
  createBrowserRouter([
    {
      path: "/",
      lazy: () => import("@/app/routes/root"),
      children: [
        { index: true, lazy: () => import("@/app/routes/profiles") },
        { path: "settings", lazy: () => import("@/app/routes/settings") },
      ],
    },
    {
      path: "*",
      lazy: () => import("@/app/routes/not-found"),
    },
  ]);

export default function AppRouter() {
  return <RouterProvider router={createAppRouter()} />;
}
