export const EXAMPLES = [
  {
    id: 'example-watering-can',
    name: 'Watering Can',
    modified: '2024-01-25T14:30:00Z',
    modifiedBy: 'System',
    ownedBy: 'HiveCAD',
    ownerId: 'Example Project',
    code: `const { makePlane, makeCylinder, draw, drawCircle } = replicad;

const defaultParams = {};

const main = () => {
  // Building the body
  const profile = draw()
    .hLine(20)
    .line(10, 5)
    .vLine(3)
    .lineTo([8, 100])
    .hLine(-8)
    .close();

  const body = profile.sketchOnPlane("XZ").revolve([0, 0, 1]);

  // Building the filler
  const topPlane = makePlane().pivot(-20, "Y").translate([-35, 0, 135]);
  const topCircle = drawCircle(12).sketchOnPlane(topPlane);

  const middleCircle = drawCircle(8).sketchOnPlane("XY", 100);

  const bottomPlane = makePlane().pivot(20, "Y").translateZ(80);
  const bottomCircle = drawCircle(9).sketchOnPlane(bottomPlane);

  const filler = topCircle.loftWith([middleCircle, bottomCircle], {
    ruled: false,
  });

  // Building the spout
  const spout = makeCylinder(5, 70)
    .translateZ(100)
    .rotate(45, [0, 0, 100], [0, 1, 0]);

  let wateringCan = body
    .fuse(filler)
    .fillet(30, (e) => e.inPlane("XY", 100))
    .fuse(spout)
    .fillet(10, (e) => e.inBox([20, 20, 100], [-20, -20, 120]));

  const spoutOpening = [
    Math.cos((45 * Math.PI) / 180) * 70,
    0,
    100 + Math.sin((45 * Math.PI) / 180) * 70,
  ];

  wateringCan = wateringCan.shell(-1, (face) =>
    face.either([
      (f) => f.containsPoint(spoutOpening),
      (f) => f.inPlane(topPlane),
    ])
  );

  return {
    shape: wateringCan,
    name: "Watering Can",
  };
};`
  },
  {
    id: 'example-gridfinity',
    name: 'Gridfinity Box',
    modified: '2024-01-25T15:00:00Z',
    modifiedBy: 'System',
    ownedBy: 'HiveCAD',
    ownerId: 'Example Project',
    code: `const {
  draw,
  drawRoundedRectangle,
  drawCircle,
  makeSolid,
  assembleWire,
  makeFace,
  EdgeFinder,
} = replicad;

const defaultParams = {
  xSize: 2,
  ySize: 1,
  heigth: 0.5,
  withMagnet: false,
  withScrew: false,
  magnetRadius: 3.25,
  magnetHeight: 2,
  screwRadius: 1.5,
  keepFull: false,
  wallThickness: 1.2,
};

// Gridfinity magic numbers
const SIZE = 42.0;
const CLEARANCE = 0.5;
const AXIS_CLEARANCE = (CLEARANCE * Math.sqrt(2)) / 4;

const CORNER_RADIUS = 4;
const TOP_FILLET = 0.6;

const SOCKET_HEIGHT = 5;
const SOCKET_SMALL_TAPER = 0.8;
const SOCKET_BIG_TAPER = 2.4;
const SOCKET_VERTICAL_PART =
  SOCKET_HEIGHT - SOCKET_SMALL_TAPER - SOCKET_BIG_TAPER;
const SOCKET_TAPER_WIDTH = SOCKET_SMALL_TAPER + SOCKET_BIG_TAPER;

const socketProfile = (_, startPoint) => {
  const full = draw([-CLEARANCE / 2, 0])
    .vLine(-CLEARANCE / 2)
    .lineTo([-SOCKET_BIG_TAPER, -SOCKET_BIG_TAPER])
    .vLine(-SOCKET_VERTICAL_PART)
    .line(-SOCKET_SMALL_TAPER, -SOCKET_SMALL_TAPER)
    .done()
    .translate(CLEARANCE / 2, 0);

  return full.sketchOnPlane("XZ", startPoint);
};

const buildSocket = ({
  magnetRadius = 3.25,
  magnetHeight = 2,
  screwRadius = 1.5,
  withScrew = true,
  withMagnet = true,
} = {}) => {
  const baseSocket = drawRoundedRectangle(
    SIZE - CLEARANCE,
    SIZE - CLEARANCE,
    CORNER_RADIUS
  ).sketchOnPlane();

  const slotSide = baseSocket.sweepSketch(socketProfile, {
    withContact: true,
  });

  let slot = makeSolid([
    slotSide,
    makeFace(
      assembleWire(
        new EdgeFinder().inPlane("XY", -SOCKET_HEIGHT).find(slotSide)
      )
    ),
    makeFace(assembleWire(new EdgeFinder().inPlane("XY", 0).find(slotSide))),
  ]);

  if (withScrew || withMagnet) {
    const magnetCutout = withMagnet
      ? drawCircle(magnetRadius).sketchOnPlane().extrude(magnetHeight)
      : null;
    const screwCutout = withScrew
      ? drawCircle(screwRadius).sketchOnPlane().extrude(SOCKET_HEIGHT)
      : null;

    const cutout =
      magnetCutout && screwCutout
        ? magnetCutout.fuse(screwCutout)
        : magnetCutout || screwCutout;

    slot = slot
      .cut(cutout.clone().translate([-13, -13, -5]))
      .cut(cutout.clone().translate([-13, 13, -5]))
      .cut(cutout.clone().translate([13, 13, -5]))
      .cut(cutout.clone().translate([13, -13, -5]));
  }

  return slot;
};

const range = (i) => [...Array(i).keys()];
const cloneOnGrid = (
  shape,
  { xSteps = 1, ySteps = 1, span = 10, xSpan = null, ySpan = null }
) => {
  const xCorr = ((xSteps - 1) * (xSpan || span)) / 2;
  const yCorr = ((ySteps - 1) * (ySpan || xSpan || span)) / 2;

  const translations = range(xSteps).flatMap((i) => {
    return range(ySteps).map((j) => [i * SIZE - xCorr, j * SIZE - yCorr, 0]);
  });
  return translations.map((translation) =>
    shape.clone().translate(translation)
  );
};

const buildTopShape = ({
  xSize,
  ySize,
  includeLip = true,
  wallThickness = 1.2,
}) => {
  const topShape = (basePlane) => {
    const sketcher = draw([-SOCKET_TAPER_WIDTH, 0])
      .line(SOCKET_SMALL_TAPER, SOCKET_SMALL_TAPER)
      .vLine(SOCKET_VERTICAL_PART)
      .line(SOCKET_BIG_TAPER, SOCKET_BIG_TAPER);

    if (includeLip) {
      sketcher
        .vLineTo(-(SOCKET_TAPER_WIDTH + wallThickness))
        .lineTo([-SOCKET_TAPER_WIDTH, -wallThickness]);
    } else {
      sketcher.vLineTo(0);
    }

    const basicShape = sketcher.close();

    const shiftedShape = basicShape
      .translate(AXIS_CLEARANCE, -AXIS_CLEARANCE)
      .intersect(
        drawRoundedRectangle(10, 10).translate(-5, includeLip ? 0 : 5)
      );

    // We need to shave off the clearance
    let topProfile = shiftedShape
      .translate(CLEARANCE / 2, 0)
      .intersect(drawRoundedRectangle(10, 10).translate(-5, 0));

    if (includeLip) {
      // We remove the wall if we add a lip
      topProfile = topProfile.cut(
        drawRoundedRectangle(1.2, 10).translate(-0.6, -5)
      );
    }

    return topProfile.sketchOnPlane(basePlane);
  };

  const boxSketch = drawRoundedRectangle(
    xSize * SIZE - CLEARANCE,
    ySize * SIZE - CLEARANCE,
    CORNER_RADIUS
  ).sketchOnPlane();

  return boxSketch
    .sweepSketch(topShape, { withContact: true })
    .fillet(TOP_FILLET, (e) =>
      e.inBox(
        [-xSize * SIZE, -ySize * SIZE, SOCKET_HEIGHT],
        [xSize * SIZE, ySize * SIZE, SOCKET_HEIGHT - 1]
      )
    );
};

function main(
  r,
  {
    xSize = 2,
    ySize = 1,
    heigth = 0.5,
    keepFull = false,
    wallThickness = 1.2,
    withMagnet = false,
    withScrew = false,
    magnetRadius = 3.25,
    magnetHeight = 2,
    screwRadius = 1.5,
  } = {}
) {
  const stdHeight = heigth * SIZE;

  let box = drawRoundedRectangle(
    xSize * SIZE - CLEARANCE,
    ySize * SIZE - CLEARANCE,
    CORNER_RADIUS
  )
    .sketchOnPlane()
    .extrude(stdHeight);

  if (!keepFull) {
    box = box.shell(wallThickness, (f) => f.inPlane("XY", stdHeight));
  }

  const top = buildTopShape({
    xSize,
    ySize,
    includeLip: !keepFull,
  }).translateZ(stdHeight);

  const socket = buildSocket({
    withMagnet,
    withScrew,
    magnetRadius,
    magnetHeight,
    screwRadius,
  });

  let base = null;
  cloneOnGrid(socket, { xSteps: xSize, ySteps: ySize, span: SIZE }).forEach(
    (movedSocket) => {
      if (base) base = base.fuse(movedSocket, { optimisation: "commonFace" });
      else base = movedSocket;
    }
  );
  return base
    .fuse(box, { optimisation: "commonFace" })
    .fuse(top, { optimisation: "commonFace" });
}`
  }
];
