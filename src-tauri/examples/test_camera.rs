use crabcamera::platform::CameraSystem;

fn main() {
    println!("Testing CrabCamera device enumeration...\n");

    // Test initialization
    println!("--- CameraSystem::initialize() ---");
    match CameraSystem::initialize() {
        Ok(msg) => println!("  OK: {}", msg),
        Err(e) => println!("  ERROR: {:?}", e),
    }

    // Test listing cameras
    println!("\n--- CameraSystem::list_cameras() ---");
    match CameraSystem::list_cameras() {
        Ok(cameras) => {
            println!("  Found {} cameras:", cameras.len());
            for cam in &cameras {
                println!("    - id: {}, name: {}, available: {}, desc: {:?}",
                    cam.id, cam.name, cam.is_available, cam.description);
            }
        }
        Err(e) => {
            println!("  ERROR: {:?}", e);
        }
    }

    // Check /dev/video* directly
    println!("\n--- /dev/video* devices ---");
    for i in 0..10 {
        let path = format!("/dev/video{}", i);
        if std::path::Path::new(&path).exists() {
            let can_open = std::fs::File::open(&path).is_ok();
            println!("  {}: exists={}, readable={}", path, true, can_open);
        }
    }
}
