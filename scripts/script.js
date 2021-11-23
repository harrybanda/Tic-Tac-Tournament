// CLEAN UP MESSY CODE LATER!

const Multipeer = require("Multipeer");
const Participants = require("Participants");
const TouchGestures = require("TouchGestures");
const Diagnostics = require("Diagnostics");
const Scene = require("Scene");
const Patches = require("Patches");
const Time = require("Time");

let activeParticipants = [];
let moves = Array(9).fill(null);
let isX = true;
let disableInput = false;
let currentMatch = { x: null, o: null, winner: null, turn: null };
let eliminated = [];
let selectorIndex = 1;
let selectorIterationOrder = [2, 5, 8, 1, 4, 7, 0, 3, 6];

(async function () {
  const [
    board,
    marksx,
    markso,
    selector,
    txt_x,
    txt_o,
    txt_eliminated,
    confeti_R,
    confeti_L,
    txt_winner,
  ] = await Promise.all([
    Scene.root.findByPath("**/board/*"),
    Scene.root.findByPath("**/marks_x/*"),
    Scene.root.findByPath("**/marks_o/*"),
    Scene.root.findFirst("selector"),
    Scene.root.findFirst("txt_x"),
    Scene.root.findFirst("txt_o"),
    Scene.root.findFirst("txt_eliminated"),
    Scene.root.findFirst("confeti_R"),
    Scene.root.findFirst("confeti_L"),
    Scene.root.findFirst("txt_winner"),
  ]);

  Patches.inputs.setBoolean("showInstruction", true);
  Time.setTimeout(function () {
    Patches.inputs.setBoolean("showInstruction", false);
  }, 5000);

  const grid = createGrid();

  placeGridObjects(board, grid);
  placeGridObjects(marksx, grid);
  placeGridObjects(markso, grid);

  const self = await Participants.self;
  const participants = await Participants.getAllOtherParticipants();

  const syncSelectChannel = Multipeer.getMessageChannel("syncSelectChannel");
  const syncMovesChannel = Multipeer.getMessageChannel("syncMovesChannel");
  const syncMatchChannel = Multipeer.getMessageChannel("syncMatchChannel");
  const syncResetChannel = Multipeer.getMessageChannel("syncResetChannel");
  const syncElimChannel = Multipeer.getMessageChannel("syncEliminatedChannel");

  participants.push(self);

  participants.forEach(function (participant) {
    participant.isActiveInSameEffect
      .monitor()
      .subscribeWithSnapshot(
        { userIndex: participants.indexOf(participant) },
        function (event, snapshot) {
          onUserEnterOrLeave(snapshot.userIndex, event.newValue);
        }
      );
    activeParticipants.push(participant);
  });

  Participants.onOtherParticipantAdded().subscribe(function (participant) {
    participants.push(participant);
    participant.isActiveInSameEffect.monitor().subscribeWithSnapshot(
      {
        userIndex: participants.indexOf(participant),
      },
      function (event, snapshot) {
        onUserEnterOrLeave(snapshot.userIndex, event.newValue);
      }
    );
    //activeParticipants.push(participant); // REMOVE IN PRODUCTION!!!!!!!!!!!!!!
  });

  sortActiveParticipantList();

  function sortActiveParticipantList() {
    activeParticipants.sort(function (a, b) {
      if (a.id < b.id) {
        return -1;
      }
      if (a.id > b.id) {
        return 1;
      }
    });
  }

  function onUserEnterOrLeave(userIndex, isActive) {
    let participant = participants[userIndex];

    if (isActive) {
      // HANDLE CALL JOIN LATER!
      activeParticipants.push(participant);
      sortActiveParticipantList();
    } else {
      let activeIndex = activeParticipants.indexOf(participant);
      activeParticipants.splice(activeIndex, 1);
      sortActiveParticipantList();

      if (participant.id === currentMatch.x) {
        currentMatch.winner = currentMatch.o;
        resetMatch();
      }

      if (participant.id === currentMatch.o) {
        currentMatch.winner = currentMatch.x;
        resetMatch();
      }
    }
  }

  TouchGestures.onTap().subscribe(() => {
    if (disableInput == false) {
      if (selectorIndex === selectorIterationOrder.length) {
        selectorIndex = 0;
      }
      let io = selectorIterationOrder[selectorIndex];

      if (io != null && selectorIterationOrder.length !== 0) {
        selector.transform.x = grid[io][0];
        selector.transform.y = grid[io][1];
        selectorIndex++;
      }
      setSyncSelectChannel();
    }
  });

  TouchGestures.onLongPress().subscribe((gesture) => {
    if (disableInput == false) {
      if (selectorIterationOrder.length > 0) {
        placeMove(selectorIterationOrder, selectorIndex, marksx, markso);
        changeTurn();

        selectorIterationOrder.splice(selectorIndex - 1, 1);
        let io = selectorIterationOrder[selectorIndex - 1];

        if (calculateWinner() !== null) {
          resetMatch();
        }

        if (io == null) {
          if (selectorIterationOrder.length === 0) handleDraw();
        } else {
          selector.transform.x = grid[io][0];
          selector.transform.y = grid[io][1];
        }

        selector.transform.x = grid[selectorIterationOrder[0]][0];
        selector.transform.y = grid[selectorIterationOrder[0]][1];
        selectorIndex = 1;

        if (currentMatch.x === self.id) {
          txt_x.hidden = false;
          txt_o.hidden = true;
        } else if (currentMatch.o === self.id) {
          txt_o.hidden = false;
          txt_x.hidden = true;
        } else {
          txt_o.hidden = true;
          txt_x.hidden = true;
        }

        setSyncSelectChannel();
        setSyncMatchChannel();
        setSyncMovesChannel();
      }
    }
  });

  // =================== GAME LOGIC ===================

  function calculateWinner() {
    const possibleLines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (let i = 0; i < possibleLines.length; i++) {
      const [a, b, c] = possibleLines[i];
      if (moves[a] && moves[a] === moves[b] && moves[a] === moves[c]) {
        let Winner = moves[a];
        if (Winner) {
          currentMatch.winner = currentMatch[Winner.toLowerCase()];
          if (currentMatch.winner === currentMatch.o)
            eliminated.push({ _id: currentMatch.x });
          else eliminated.push({ _id: currentMatch.o });
          setSyncEliminatedChannel();
          return Winner;
        }
      }
    }
    return null;
  }

  function placeMove(selectorIterationOrder, selectorIndex, marksx, markso) {
    if (isX) {
      let m = [...moves];
      m[selectorIterationOrder[selectorIndex - 1]] = "X";
      moves = m;
      let mx = [...marksx];
      mx[selectorIterationOrder[selectorIndex - 1]].hidden = false;
      marksx = mx;
    } else {
      let m = [...moves];
      m[selectorIterationOrder[selectorIndex - 1]] = "O";
      moves = m;
      let mo = [...markso];
      mo[selectorIterationOrder[selectorIndex - 1]].hidden = false;
      markso = mo;
    }
    isX = !isX;
  }

  function placeGridObjects(objects, grid) {
    for (let i = 0; i < grid.length; i++) {
      let path = grid[i];
      let x = path[0];
      let y = path[1];
      let pos = objects[i];
      pos.transform.x = x;
      pos.transform.y = y;
    }
  }

  function createGrid() {
    let coords = [];
    let val = 0.045;
    for (let i = -val; i <= val; i += val) {
      for (let j = -val; j <= val; j += val) {
        let x = Math.round(i * 1e4) / 1e4;
        let y = Math.round(j * 1e4) / 1e4;
        coords.push([x, y]);
      }
    }
    return coords;
  }

  if (Math.random() < 0.5) {
    setupMatch(activeParticipants[0]._id, activeParticipants[1]._id);
  } else {
    setupMatch(activeParticipants[1]._id, activeParticipants[0]._id);
  }

  function changeTurn() {
    if (currentMatch.turn === currentMatch.x) {
      currentMatch.turn = currentMatch.o;
    } else {
      currentMatch.turn = currentMatch.x;
    }
    if (currentMatch.turn === self.id) {
      boardVisibility(false);
      disableInput = false;
    } else {
      boardVisibility(true);
      disableInput = true;
    }
  }

  function setupMatch(player1, player2) {
    currentMatch.x = player1;
    currentMatch.o = player2;
    currentMatch.turn = currentMatch.x;

    if (currentMatch.turn === self.id) {
      boardVisibility(false);
      disableInput = false;
    } else {
      boardVisibility(true);
      disableInput = true;
    }

    if (currentMatch.x === self.id) {
      txt_x.hidden = false;
      txt_o.hidden = true;
    } else if (currentMatch.o === self.id) {
      txt_o.hidden = false;
      txt_x.hidden = true;
    }

    setSyncMatchChannel();
  }

  function resetMatch() {
    moves = Array(9).fill(null);
    isX = true;
    disableInput = false;
    currentMatch = {
      x: null,
      o: null,
      winner: currentMatch.winner,
      turn: null,
    };
    selectorIndex = 1;
    selectorIterationOrder = [2, 5, 8, 1, 4, 7, 0, 3, 6];

    for (let i = 0; i < marksx.length; i++) {
      marksx[i].hidden = true;
    }

    for (let i = 0; i < markso.length; i++) {
      markso[i].hidden = true;
    }

    if (pickNextOpponent() != null) {
      if (Math.random() < 0.5) {
        setupMatch(currentMatch.winner, pickNextOpponent()._id);
      } else {
        setupMatch(pickNextOpponent()._id, currentMatch.winner);
      }
    } else {
      showFinalWinner();
    }

    if (currentMatch.x === self.id) {
      txt_x.hidden = false;
      txt_o.hidden = true;
    } else if (currentMatch.o === self.id) {
      txt_o.hidden = false;
      txt_x.hidden = true;
    } else {
      txt_o.hidden = true;
      txt_x.hidden = true;
    }

    setSyncResetChannel();
  }

  function pickNextOpponent() {
    let currentPats = activeParticipants;

    let removed = currentPats.filter(function (item) {
      return (
        eliminated.filter(function (item2) {
          return item._id == item2._id;
        }).length == 0
      );
    });
    let removed2 = removed.filter(function (obj) {
      return obj._id !== self.id;
    });

    if (removed2 === []) {
      return null;
    } else {
      let nextOpponent = removed2[Math.floor(Math.random() * removed2.length)];
      return nextOpponent;
    }
  }

  function handleDraw() {
    moves = Array(9).fill(null);
    isX = true;
    disableInput = false;
    selectorIndex = 1;
    selectorIterationOrder = [2, 5, 8, 1, 4, 7, 0, 3, 6];

    for (let i = 0; i < marksx.length; i++) {
      marksx[i].hidden = true;
    }

    for (let i = 0; i < markso.length; i++) {
      markso[i].hidden = true;
    }
    if (currentMatch.x === self.id) {
      txt_x.hidden = false;
      txt_o.hidden = true;
    } else if (currentMatch.o === self.id) {
      txt_o.hidden = false;
      txt_x.hidden = true;
    } else {
      txt_o.hidden = true;
      txt_x.hidden = true;
    }

    let newX = currentMatch.o;
    let newO = currentMatch.x;
    setupMatch(newX, newO);
    setSyncResetChannel();
  }

  function boardVisibility(hidden) {
    if (hidden) {
      selector.hidden = true;
      for (let i = 0; i < moves.length; i++) {
        if (moves[i] === "X") {
          marksx[i].hidden = true;
        } else if (moves[i] === "O") {
          markso[i].hidden = true;
        }
      }
      for (let i = 0; i < board.length; i++) {
        board[i].hidden = true;
      }
    } else {
      selector.hidden = false;
      for (let i = 0; i < moves.length; i++) {
        if (moves[i] === "X") {
          marksx[i].hidden = false;
        } else if (moves[i] === "O") {
          markso[i].hidden = false;
        }
      }
      for (let i = 0; i < board.length; i++) {
        board[i].hidden = false;
      }
    }
  }

  function showFinalWinner() {
    if (currentMatch.winner === self.id) {
      confeti_L.birthrate = 200;
      confeti_R.birthrate = 200;
      txt_winner.hidden = false;
    }

    currentMatch.winner = null;
    eliminated = [];
    txt_o.hidden = true;
    txt_x.hidden = true;

    Time.setTimeout(function () {
      confeti_L.birthrate = 0;
      confeti_R.birthrate = 0;
    }, 500);

    Time.setTimeout(function () {
      txt_winner.hidden = true;
      if (Math.random() < 0.5) {
        setupMatch(activeParticipants[0]._id, activeParticipants[1]._id);
      } else {
        setupMatch(activeParticipants[1]._id, activeParticipants[0]._id);
      }
      setSyncEliminatedChannel();
    }, 5000);
  }

  // =================== MESSAGE CHANNEL SUBSCRIPTIONS ===================

  syncSelectChannel.onMessage.subscribe(function (msg) {
    selectorIndex = msg.selector;
    selectorIterationOrder = msg.selectorIterationOrder;
    let io = selectorIterationOrder[selectorIndex - 1];
    selector.transform.x = grid[io][0];
    selector.transform.y = grid[io][1];
  });

  syncMovesChannel.onMessage.subscribe(function (msg) {
    moves = msg.moves;
    isX = msg.isX;

    for (let i = 0; i < moves.length; i++) {
      if (moves[i] === "X") {
        marksx[i].hidden = false;
      } else if (moves[i] === "O") {
        markso[i].hidden = false;
      }
    }
  });

  syncMatchChannel.onMessage.subscribe(function (msg) {
    currentMatch = msg.currentMatch;
    disableInput = msg.disableInput;

    if (currentMatch.turn === self.id) {
      boardVisibility(false);
      disableInput = false;
    } else {
      boardVisibility(true);
      disableInput = true;
    }

    if (currentMatch.x === self.id) {
      txt_x.hidden = false;
      txt_o.hidden = true;
    } else if (currentMatch.o === self.id) {
      txt_o.hidden = false;
      txt_x.hidden = true;
    } else {
      txt_o.hidden = true;
      txt_x.hidden = true;
    }
  });

  syncResetChannel.onMessage.subscribe(function (msg) {
    moves = msg.moves;

    for (let i = 0; i < marksx.length; i++) {
      marksx[i].hidden = true;
    }

    for (let i = 0; i < markso.length; i++) {
      markso[i].hidden = true;
    }
  });

  syncElimChannel.onMessage.subscribe(function (msg) {
    eliminated = msg.eliminated;

    const found = eliminated.some((el) => el._id === self.id);
    if (found) {
      Patches.inputs.setBoolean("showEliminated", true);
      txt_eliminated.hidden = false;
      txt_x.hidden = true;
      txt_o.hidden = true;
    } else {
      Patches.inputs.setBoolean("showEliminated", false);
      txt_eliminated.hidden = true;
    }

    if (currentMatch.x === self.id) {
      txt_x.hidden = false;
      txt_o.hidden = true;
    } else if (currentMatch.o === self.id) {
      txt_o.hidden = false;
      txt_x.hidden = true;
    } else {
      txt_o.hidden = true;
      txt_x.hidden = true;
    }
  });

  // =================== SYNC CHANNEL FUNCTIONS ===================

  function setSyncSelectChannel() {
    syncSelectChannel
      .sendMessage(
        {
          selector: selectorIndex,
          selectorIterationOrder: selectorIterationOrder,
        },
        false
      )
      .catch((err) => {
        Diagnostics.log(err);
      });
  }

  function setSyncMovesChannel() {
    syncMovesChannel
      .sendMessage(
        {
          moves: moves,
          isX: isX,
        },
        false
      )
      .catch((err) => {
        Diagnostics.log(err);
      });
  }

  function setSyncMatchChannel() {
    syncMatchChannel
      .sendMessage(
        { currentMatch: currentMatch, disableInput: disableInput },
        false
      )
      .catch((err) => {
        Diagnostics.log(err);
      });
  }

  function setSyncResetChannel() {
    syncResetChannel.sendMessage({ moves: moves }, false).catch((err) => {
      Diagnostics.log(err);
    });
  }

  function setSyncEliminatedChannel() {
    syncElimChannel
      .sendMessage({ eliminated: eliminated }, false)
      .catch((err) => {
        Diagnostics.log(err);
      });
  }
})();
