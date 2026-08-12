import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    LAPTOP — I CAN'T OPEN A CERTAIN FILE TYPE (.MOV, .HEIC)      |
///  +-----------------------------------------------------------------+
//
//  The KSB-specific part is Company Portal. Somebody who cannot open a .MOV
//  will search the web for a player and install whatever comes up, which is
//  how machines acquire toolbars and worse. The article exists mainly to say
//  the approved software is already there and needs no admin rights.
//
//  Opening the file and setting the default are ONE step, because Windows
//  makes them one choice: the Open with dialog ends in Always or Just once,
//  and Always is what stops the reader coming back to this article for every
//  subsequent file. An earlier draft split them, which would have sent people
//  through the dialog twice for no reason.
//
//  SCOPED TO VIDEO ON PURPOSE. The symptom originally named .HEIC as well,
//  but VLC is a media player and does not open still images — and whether
//  HEIC already works depends on the HEIF Image Extension being present in
//  the build, which is unconfirmed for ordinary user machines. Rather than
//  guess, the article covers what is known. Add a HEIC step here once
//  somebody has opened one on a standard, non-admin laptop.
///  +-----------------------------------------------------------------+

const cannotOpenFileType: Article = {
  symptomId: "cannot-open-file-type",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "Windows doesn't ship with a player for some video formats, .MOV among them. VLC Media Player handles them and installs from Company Portal without needing admin rights.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: ["You can find the file you're trying to open"],
  steps: [
    {
      title: "Open Company Portal",
      body: "Press the Start button and type Company Portal, then open it. It is already installed on every managed laptop.",
      note: "Company Portal is where approved software lives. You don't need to download VLC from the internet, and it's worth not doing — search results for media players are a well-known way to pick up something you didn't want.",
      figure: {
        images: [
          {
            src: "laptop/cannot-open-file-type/Vlc-companyportal-light.jpg",
            srcDark: "laptop/cannot-open-file-type/Vlc-companyportal-dark.jpg",
          },
        ],
        size: "window",
        caption: "Start › search 'Company Portal' › Open",
      },
    },
    {
      title: "Search for VLC and install it",
      body: "Type VLC into the search box at the top. VLC Media Player comes back as the only result — open it and choose Install. It installs on its own and needs no admin rights.",
      figure: {
        images: [
          {
            src: "laptop/cannot-open-file-type/Vlc-install-light.jpg",
            srcDark: "laptop/cannot-open-file-type/Vlc-install-dark.jpg",
          },
        ],
        size: "window",
        caption: "Company Portal › search 'VLC' › VLC Media Player",
      },
    },
    {
      title: "Open the file with VLC, and choose Always",
      body: "Right-click the file and choose Open with › Choose another app. Pick VLC media player from the list, then click Always at the bottom. The file opens, and every file of that type opens in VLC from then on.",
      note: "Always and Just once sit side by side, and Just once is the trap — it opens this file and leaves the next one just as stuck. Always is what makes this a one-off job.",
      figure: {
        images: [
          {
            src: "laptop/cannot-open-file-type/Vlc-use-light.jpg",
            srcDark: "laptop/cannot-open-file-type/Vlc-use-dark.jpg",
          },
        ],
        caption: "Open with › Choose another app › VLC media player › Always",
      },
    },
  ],
};

export default cannotOpenFileType;
