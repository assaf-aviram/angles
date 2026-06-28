import { Nav } from "./components/nav";
import { Images } from "./components/images";
import { ImageViewer } from "./components/ImageViewer";

function App() {
  return (
    <div className="min-h-full text-white">
      <Nav />
      <header className="relative bg-gray-800 after:pointer-events-none after:absolute after:inset-x-0 after:inset-y-0 after:border-y after:border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Bike Fit Angles
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Paste video frames, then draw lines to measure joint angles.
          </p>
        </div>
      </header>
      <main>
        <Images />
      </main>
      <ImageViewer />
    </div>
  );
}

export { App };
