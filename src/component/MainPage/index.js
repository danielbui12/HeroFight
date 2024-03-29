import React, { useEffect, useRef, useState } from 'react'
import "./main_page.scss"
import Sprite from '../../oop/Sprite';
import Fighter from '../../oop/Fighter';
import gsap from 'gsap';
import { io } from 'socket.io-client';
import { useHistory } from 'react-router-dom';
import { useSelector } from 'react-redux';

const background = new Sprite({
  position: {
    x: 0,
    y: 0
  },
  imageSrc: window.origin + "/img/background.png"
})

const shop = new Sprite({
  position: {
    x: 600,
    y: 128
  },
  imageSrc: window.origin + "/img/shop.png",
  scale: 2.75,
  framesMax: 6
})

let timerId
let player
let enemy
let requestAnimationFrameId
function MainPage() {
  const canvasRef = useRef()
  const timerRef = useRef()
  const countDownRef = useRef()
  const [isStart, setIsStart] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [isFirstTime, setIsFirstTime] = useState(true)
  const app = useSelector(state => state.app)
  const [client, setClient] = useState()
  const { currentRoom, playerDetail } = app
  const history = useHistory()

  function ioConnect(url, option) {
    setClient(io(url, option))
  }

  const handleConnect = () => {
    let url = process.env.REACT_APP_API_URL

    const options = {
      reconnectionDelayMax: 5000,
      auth: {
        token: process.env.REACT_APP_SECRET_TOKEN
      },
      autoConnect: true,
      timeout: 1000
    };

    ioConnect(url, options);
  };

  const handleDisconnect = () => {
    if (client) {
      client.emit('disconnect')
      client.close()
      client.disconnect()
    }
  };

  useEffect(() => {
    let isMounted = false;
    if (isMounted) return;

    handleConnect()
    return () => {
      isMounted = true;
      handleDisconnect()
    }
  }, [])

  function handleCountdown() {
    setTimeout(() => {
      countDownRef.current.innerHTML = ''
      setIsStart(true)
    }, 500)
    window.addEventListener('keyup', (e) => {
      if (isDone) return;
      onKeyUp(e)
    })
    window.addEventListener('keydown', (e) => {
      if (isDone) return;
      onKeyDown(e)
    })
  }

  async function handleStartGame() {
    if (!isStart && !isDone) {
      setIsStart(true)
      handleCountdown()
      // get detail champ
      let champ = await require(`../../oop/champ/${currentRoom.players[0].champion}.json`)
      player = new Fighter(champ)

      champ = await require(`../../oop/champ/${currentRoom.players[1].champion}Enemy.json`)
      enemy = new Fighter(champ)
    }
  }

  async function setStateFighter({ key, type, who }) {
    if (playerDetail.isHost && who === 'fighter2') {
      // update enemy
      if (type === "UP") {
        checkOnKeyUp(key, false)
      } else if (type === "DOWN") {
        checkOnKeyDown(key, false)
      }
    } else if (!playerDetail.isHost && who === 'fighter1') {
      // up date player
      if (type === "UP") {
        checkOnKeyUp(key, true)
      } else if (type === "DOWN") {
        checkOnKeyDown(key, true)
      }
    }
  }

  useEffect(() => {
    let isMounted = false;
    if (isMounted) return;

    if (client && isFirstTime) {
      client.emit('player_load_completely', {
        roomId: currentRoom.roomId
      })
      setIsFirstTime(false)
    }
    return () => {
      isMounted = true;
    }
  }, [client, isFirstTime, setIsFirstTime])

  useEffect(() => {
    if (!client) return
    let isMounted = false;
    if (isMounted) return;

    client.on('start_game', handleStartGame)

    client.on('receive_action', setStateFighter)

    client.on('game_over', () => {
      determineWinner()
      handleGameOver()
    })

    client.on('battle_update', (res) => {
      timerRef.current.innerHTML = res
    })

    return () => {
      client.off('receive_action')
      client.off('game_over')
      client.off('battle_update')
      isMounted = true;
    }
  }, [client])

  useEffect(() => {
    if (canvasRef && canvasRef.current) {
      animate()
    }
    return () => {
      window.cancelAnimationFrame(requestAnimationFrameId)
    }
  }, [canvasRef])

  function rectangularCollision({ rectangle1, rectangle2 }) {
    return (
      rectangle1.attackBox.position.x + rectangle1.attackBox.width >=
      rectangle2.position.x &&
      rectangle1.attackBox.position.x <=
      rectangle2.position.x + rectangle2.width &&
      rectangle1.attackBox.position.y + rectangle1.attackBox.height >=
      rectangle2.position.y &&
      rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
    )
  }

  function checkMovement(player) {
    if (player.keys.ArrowLeft.pressed && player.lastKey === 'ArrowLeft') {
      if (player.position.x <= player.minX) {
        player.position.x = player.minX + 1
        player.velocity.x = 0
      } else {
        player.velocity.x = -5
      }
      player.switchSprite('run')
    } else if (player.keys.ArrowRight.pressed && player.lastKey === 'ArrowRight') {
      if (player.position.x >= player.maxX) {
        player.position.x = player.maxX - 1
        player.velocity.x = 0
      } else {
        player.velocity.x = 5
      }
      player.switchSprite('run')
    } else {
      player.velocity.x = 0
      player.switchSprite('idle')
    }

    // jumping
    if (player.velocity.y < 0 && (player && !player.isJumping)) {
      player.switchSprite('jump')
      player.isJumping = true
    } else if (player.velocity.y > 0) {
      player.switchSprite('fall')
    }
  }

  function checkCollisionAndGetsHit(player, enemy, id) {
    // detect for collision & enemy gets hit
    if (
      rectangularCollision({
        rectangle1: player,
        rectangle2: enemy
      }) &&
      player.isAttacking &&
      player.framesCurrent === 4
    ) {
      enemy.takeHit(player.damage)
      player.isAttacking = false
      gsap.to(id, {
        width: (enemy.health / enemy.hp * 100) + '%'
      })
    }

    // if player misses
    if (player.isAttacking && player.framesCurrent === 4) {
      player.isAttacking = false
    }
  }

  function determineWinner() {
    timerRef.current.innerHTML = 0
    document.getElementById('displayText').style.display = "flex"
    if (
      player.health === player.hp &&
      enemy.health === enemy.hp
    ) {
      document.getElementById('displayText').innerHTML = "Tie"
    } else if (player.health > enemy.health) {
      document.getElementById('displayText').innerHTML = currentRoom.players[0].playerName + ' win!'
    } else if (player.health < enemy.health) {
      document.getElementById('displayText').innerHTML = currentRoom.players[1].playerName + ' win!';
    }
  }

  async function checkPlayerAction() {
    if (!player || !enemy) {
      return;
    }
    checkMovement(playerDetail.isHost ? player : enemy);
    checkMovement(playerDetail.isHost ? enemy : player);

    checkCollisionAndGetsHit(
      playerDetail.isHost ? player : enemy,
      playerDetail.isHost ? enemy : player,
      playerDetail.isHost ? "#enemyHealth" : "#playerHealth"
    );
    checkCollisionAndGetsHit(
      playerDetail.isHost ? enemy : player,
      playerDetail.isHost ? player : enemy,
      playerDetail.isHost ? "#playerHealth" : "#enemyHealth"
    );

    // end game based on health
    if (player.health <= 0 || enemy.health <= 0) {
      if (client) {
        client.emit('game_over', {
          roomId: currentRoom.roomId
        })
      }
      determineWinner()
      handleGameOver()
    }
  }

  async function animate() {
    requestAnimationFrameId = window.requestAnimationFrame(animate)
    const c = await canvasRef.current.getContext('2d')
    c.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    const canvas = canvasRef.current
    c.fillStyle = 'black'
    c.fillRect(0, 0, canvas.width, canvas.height)
    background.update(c)
    shop.update(c)
    c.fillStyle = 'rgba(255, 255, 255, 0.15)'
    c.fillRect(0, 0, canvas.width, canvas.height)
    if (player && enemy) {
      player.update(c, canvas)
      enemy.update(c, canvas)
      player.velocity.x = 0
      enemy.velocity.x = 0
      checkPlayerAction()
    }
  }

  function handleEmitAction(payload) {
    client.emit('player_do_action', {
      ...payload,
      roomId: currentRoom.roomId,
      who: playerDetail.isHost ? 'fighter1' : 'fighter2'
    })
  }

  function checkOnKeyUp(key, isHost) {
    if (isHost) {
      switch (key) {
        case 'ArrowRight':
          player.keys.ArrowRight.pressed = false
          break
        case 'ArrowLeft':
          player.keys.ArrowLeft.pressed = false
          break
      }
    } else {
      switch (key) {
        case 'ArrowRight':
          enemy.keys.ArrowRight.pressed = false
          break
        case 'ArrowLeft':
          enemy.keys.ArrowLeft.pressed = false
          break
      }
    }
  }

  function onKeyUp(event) {
    checkOnKeyUp(event.key, playerDetail.isHost);
    handleEmitAction({
      key: event.key,
      type: "UP"
    })
  }

  function handleCheckOnkeyDown(key, player) {
    let isEmit = true
    switch (key) {
      case 'ArrowRight':
        if (!player.keys.ArrowRight.pressed) {
          player.keys.ArrowRight.pressed = true
        } else {
          isEmit = false
        }
        player.lastKey = key
        break
      case 'ArrowLeft':
        if (!player.keys.ArrowLeft.pressed) {
          player.keys.ArrowLeft.pressed = true
        } else {
          isEmit = false
        }
        player.lastKey = key
        break
      case " ":
        player.attack()
        break
      case "ArrowUp":
        if (!player.isJumping) {
          player.isJumping = true
          setTimeout(() => {
            player.isJumping = false
          }, 800)
          player.velocity.y = -15
        }
        break
    }
    return isEmit
  }

  function checkOnKeyDown(key, isHost) {
    let isEmit = true
    if (isHost) {
      isEmit = handleCheckOnkeyDown(key, player)
    } else {
      isEmit = handleCheckOnkeyDown(key, enemy)
    }
    return isEmit
  }

  function onKeyDown(event) {
    const isEmit = checkOnKeyDown(event.key, playerDetail.isHost)
    if (isEmit) {
      handleEmitAction({
        key: event.key,
        type: "DOWN"
      })
    }
  }

  function handleGameOver() {
    if (client) {
      client.off('battle_update')
      client.emit('battle_off', {
        roomId: currentRoom.roomId
      })
    }
    window.removeEventListener('keyup', null)
    window.removeEventListener('keydown', null)
    player.velocity.x = 0;
    enemy.velocity.x = 0;
    setIsDone(true)
  }

  return (
    <>
      <img src={window.origin + '/img/background_full.png'} />
      <div className='main_page_container'>
        <div className='fight_screen' style={{
          backgroundImage: `url(${window.origin + "/img/outline.png"}`
        }}>
          <div className='outline'>
            <div className='health'>
              <div className='lose_health'></div>
              <div id="playerHealth"></div>
            </div>

            <div ref={timerRef} id="timer">10</div>
            <div className='health'>
              <div className='lose_health'></div>
              <div id="enemyHealth"></div>
            </div>
            <div></div>
          </div>
          <div id="displayText">Tie</div>
          <div
            id="startGame"
            onClick={(e) => {
              e.preventDefault()
              if (isDone) {
                history.replace('/waiting-room')
              }
            }}
            style={{
              display: (!isDone && isStart) ? 'none' : 'block',
              marginTop: (!isDone && isStart) ? 'auto' : '30%'
            }}
          >
            <div>
              <img width="270" height="110" src={window.origin + "/img/fight.png"} />
              <p className='h5'>{isDone ? "Back to room" : "Wait for enemy"}</p>
            </div>
          </div>
          <canvas width={1024} height={576} ref={canvasRef}></canvas>
        </div>
      </div>
      <div ref={countDownRef} className="timeStart" />
    </>
  )
}

export default MainPage